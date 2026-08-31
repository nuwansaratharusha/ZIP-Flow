using System.Collections.Concurrent;
using System.Security;
using System.Text;

namespace ZipFlow.Api.Services;

/// <summary>A print job waiting for the Epson printer to poll and collect.</summary>
public sealed record PrintJob(string Id, string Xml, string Description, DateTimeOffset EnqueuedAt);

public sealed record PrintQueueStatus(
    int Pending, long TotalPolls, DateTimeOffset? LastPollAt, IReadOnlyList<string> Recent);

/// <summary>
/// In-memory queue for Epson "Server Direct Print". The cloud API can never open
/// a socket to a printer on the shop LAN, so instead the printer polls us: it
/// makes outbound HTTP requests at an interval, and we hand back the next ePOS-Print
/// document for it to print. Jobs are enqueued by the order/bill endpoints.
///
/// One queue per process is enough for a single-location deployment. If this grows
/// to multiple sites, key the queue by tenant/printer.
/// </summary>
public interface IServerDirectPrintQueue
{
    void Enqueue(PrintJob job);
    bool TryDequeue(out PrintJob? job);
    void RecordPoll();
    void Log(string message);
    PrintQueueStatus Status();
}

public sealed class ServerDirectPrintQueue : IServerDirectPrintQueue
{
    private readonly ConcurrentQueue<PrintJob> _jobs = new();
    private readonly ConcurrentQueue<string> _log = new();
    private long _totalPolls;
    private DateTimeOffset? _lastPollAt;

    public void Enqueue(PrintJob job)
    {
        _jobs.Enqueue(job);
        Log($"queued {job.Id} ({job.Description})");
    }

    public bool TryDequeue(out PrintJob? job) => _jobs.TryDequeue(out job);

    public void RecordPoll()
    {
        Interlocked.Increment(ref _totalPolls);
        _lastPollAt = DateTimeOffset.UtcNow;
    }

    public void Log(string message)
    {
        _log.Enqueue($"{DateTimeOffset.UtcNow:HH:mm:ss} {message}");
        while (_log.Count > 50 && _log.TryDequeue(out _)) { }
    }

    public PrintQueueStatus Status() =>
        new(_jobs.Count, Interlocked.Read(ref _totalPolls), _lastPollAt, _log.ToArray());
}

/// <summary>
/// Builds ePOS-Print XML (the format Epson TM intelligent printers accept over
/// Server Direct Print). Mirrors the plain-text layout the old TCP path produced.
/// </summary>
public static class EposPrintXmlBuilder
{
    private const string Ns = "http://www.epson-pos.com/schemas/2011/03/epos-print";
    private const string Divider = "--------------------------------";

    public static string BuildBill(string businessName, string footerMessage, OrderDto order)
    {
        var b = new Builder();
        b.Center().Big().Line(businessName).Normal();
        b.Left();
        b.Line($"Order #{order.OrderNumber} - {order.TableName}");
        b.Line(order.CustomerName);
        b.Line(Divider);

        foreach (var round in order.Rounds.OrderBy(r => r.RoundNumber))
        {
            b.Line($"Round {round.RoundNumber}");
            foreach (var line in round.Lines)
                b.Line($"  {line.Quantity}x {line.Name} - {order.CurrencyCode} {line.LineTotal:0.00}");
        }

        b.Line(Divider);
        b.Line($"Subtotal: {order.CurrencyCode} {order.Subtotal:0.00}");
        if (order.ServiceCharge > 0)
            b.Line($"Service charge: {order.CurrencyCode} {order.ServiceCharge:0.00}");
        b.Line($"Tax: {order.CurrencyCode} {order.Tax:0.00}");
        b.Big().Line($"TOTAL: {order.CurrencyCode} {order.Total:0.00}").Normal();
        b.BlankLine();
        if (!string.IsNullOrWhiteSpace(footerMessage))
            b.Center().Line(footerMessage).Left();
        return b.ToXml();
    }

    public static string BuildRound(string businessName, OrderDto order, OrderRoundDto round)
    {
        var b = new Builder();
        b.Center().Big().Line(businessName).Normal().Left();
        b.Line($"Order #{order.OrderNumber} - {order.TableName}");
        b.Line(order.CustomerName);
        b.Line($"Round {round.RoundNumber}");
        b.Line(Divider);
        foreach (var line in round.Lines)
        {
            b.Line($"{line.Quantity}x {line.Name}");
            if (!string.IsNullOrWhiteSpace(line.Notes))
                b.Line($"  Note: {line.Notes}");
        }
        b.Line(Divider);
        b.Line($"Round total: {order.CurrencyCode} {round.RoundTotal:0.00}");
        return b.ToXml();
    }

    public static string BuildTest(string businessName)
    {
        var b = new Builder();
        b.Center().Big().Line(businessName).Normal();
        b.Line("*** PRINTER TEST ***");
        b.Left().Line(Divider);
        b.Line("ZIP Flow Server Direct Print");
        b.Line("If you can read this,");
        b.Line("cloud printing works!");
        b.Line(Divider);
        b.Center().Line("Thank you").Left();
        return b.ToXml();
    }

    private sealed class Builder
    {
        private readonly StringBuilder _sb = new();

        public Builder Center() { _sb.Append("<text align=\"center\"/>"); return this; }
        public Builder Left() { _sb.Append("<text align=\"left\"/>"); return this; }
        public Builder Big() { _sb.Append("<text width=\"2\" height=\"2\"/>"); return this; }
        public Builder Normal() { _sb.Append("<text width=\"1\" height=\"1\"/>"); return this; }
        public Builder BlankLine() { _sb.Append("<feed line=\"1\"/>"); return this; }

        public Builder Line(string text)
        {
            _sb.Append("<text>").Append(Escape(text)).Append("&#10;</text>");
            return this;
        }

        public string ToXml()
        {
            var sb = new StringBuilder();
            sb.Append("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
            sb.Append("<epos-print xmlns=\"").Append(Ns).Append("\">");
            sb.Append(_sb);
            sb.Append("<feed line=\"3\"/>");
            sb.Append("<cut type=\"feed\"/>");
            sb.Append("</epos-print>");
            return sb.ToString();
        }

        private static string Escape(string s) => SecurityElement.Escape(s) ?? string.Empty;
    }
}
