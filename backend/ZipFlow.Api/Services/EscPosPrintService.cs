using System.Net.Sockets;
using System.Text;

namespace ZipFlow.Api.Services;

public sealed class PrinterUnavailableException(string message) : Exception(message);

public interface IEscPosPrintService
{
    Task PrintRoundTicketAsync(
        string ipAddress, int port, string businessName, int orderNumber, string tableName,
        string customerName, OrderRoundDto round, string currencySymbol, CancellationToken ct);

    Task PrintBillAsync(
        string ipAddress, int port, string businessName, string footerMessage, OrderDto order, CancellationToken ct);
}

/// <summary>
/// Sends plain-text tickets to a network ESC/POS thermal printer over raw TCP
/// (the printer's raw/9100 listener, not a print-driver API). Only the three
/// commands this MVP needs are hand-rolled: initialize, then a paper cut —
/// everything else is just newline-terminated text, which every ESC/POS
/// printer accepts without further escaping.
/// </summary>
public sealed class EscPosPrintService(ILogger<EscPosPrintService> logger) : IEscPosPrintService
{
    private static readonly byte[] Init = [0x1B, 0x40];
    private static readonly byte[] Cut = [0x1D, 0x56, 0x00];
    private const string Divider = "--------------------------------";

    public Task PrintRoundTicketAsync(
        string ipAddress, int port, string businessName, int orderNumber, string tableName,
        string customerName, OrderRoundDto round, string currencySymbol, CancellationToken ct)
    {
        var lines = new List<string>
        {
            businessName,
            $"Order #{orderNumber} - {tableName}",
            customerName,
            $"Round {round.RoundNumber}",
            Divider,
        };

        foreach (var line in round.Lines)
        {
            lines.Add($"{line.Quantity}x {line.Name}");
            if (!string.IsNullOrWhiteSpace(line.Notes))
                lines.Add($"  Note: {line.Notes}");
        }

        lines.Add(Divider);
        lines.Add($"Round total: {currencySymbol}{round.RoundTotal:0.00}");

        return SendAsync(ipAddress, port, lines, ct);
    }

    public Task PrintBillAsync(
        string ipAddress, int port, string businessName, string footerMessage, OrderDto order, CancellationToken ct)
    {
        var lines = new List<string>
        {
            businessName,
            $"Order #{order.OrderNumber} - {order.TableName}",
            order.CustomerName,
            Divider,
        };

        foreach (var round in order.Rounds.OrderBy(r => r.RoundNumber))
        {
            lines.Add($"Round {round.RoundNumber}");
            foreach (var line in round.Lines)
                lines.Add($"  {line.Quantity}x {line.Name} - {order.CurrencySymbol}{line.LineTotal:0.00}");
        }

        lines.Add(Divider);
        lines.Add($"Subtotal: {order.CurrencySymbol}{order.Subtotal:0.00}");
        if (order.ServiceCharge > 0)
            lines.Add($"Service charge: {order.CurrencySymbol}{order.ServiceCharge:0.00}");
        lines.Add($"Tax: {order.CurrencySymbol}{order.Tax:0.00}");
        lines.Add($"Total: {order.CurrencySymbol}{order.Total:0.00}");
        lines.Add(footerMessage);

        return SendAsync(ipAddress, port, lines, ct);
    }

    private async Task SendAsync(string ipAddress, int port, IReadOnlyList<string> lines, CancellationToken ct)
    {
        using var payload = new MemoryStream();
        payload.Write(Init);
        foreach (var line in lines)
            payload.Write(Encoding.UTF8.GetBytes(line + "\n"));
        payload.Write(Encoding.UTF8.GetBytes("\n\n\n"));
        payload.Write(Cut);

        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(ipAddress, port, ct).AsTask().WaitAsync(TimeSpan.FromSeconds(5), ct);
            using var stream = client.GetStream();
            await stream.WriteAsync(payload.ToArray(), ct);
        }
        catch (Exception ex) when (ex is SocketException or TimeoutException)
        {
            logger.LogWarning(ex, "Failed to reach printer at {IpAddress}:{Port}", ipAddress, port);
            throw new PrinterUnavailableException($"Could not reach printer at {ipAddress}:{port}.");
        }
    }
}
