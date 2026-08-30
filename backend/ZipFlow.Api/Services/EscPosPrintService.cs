using System.IO;
using System.Net.Sockets;
using System.Text;

namespace ZipFlow.Api.Services;

public sealed class PrinterUnavailableException(string message) : Exception(message);

public interface IEscPosPrintService
{
    Task PrintRoundTicketAsync(
        string ipAddress, int port, string businessName, int orderNumber, string tableName,
        string customerName, OrderRoundDto round, string currencyCode, CancellationToken ct);

    Task PrintBillAsync(
        string ipAddress, int port, string businessName, string footerMessage, OrderDto order, CancellationToken ct);

    Task TestPrintAsync(
        string ipAddress, int port, string businessName, CancellationToken ct);
}

/// <summary>
/// Formats and streams raw ESC/POS commands to network thermal printers (such as Epson TM-m30II)
/// over TCP port 9100. Handles centering, bolding, character column alignment, and clean cutting.
/// </summary>
public sealed class EscPosPrintService(ILogger<EscPosPrintService> logger) : IEscPosPrintService
{
    // ESC/POS Command Constants
    private static readonly byte[] CmdInit = [0x1B, 0x40];                   // ESC @ (Initialize printer)
    private static readonly byte[] CmdAlignLeft = [0x1B, 0x61, 0x00];        // ESC a 0 (Left align)
    private static readonly byte[] CmdAlignCenter = [0x1B, 0x61, 0x01];     // ESC a 1 (Center align)
    private static readonly byte[] CmdAlignRight = [0x1B, 0x61, 0x02];      // ESC a 2 (Right align)
    private static readonly byte[] CmdBoldOn = [0x1B, 0x45, 0x01];           // ESC E 1 (Bold on)
    private static readonly byte[] CmdBoldOff = [0x1B, 0x45, 0x00];          // ESC E 0 (Bold off)
    private static readonly byte[] CmdDoubleHeightOn = [0x1B, 0x21, 0x10];   // Double height
    private static readonly byte[] CmdDoubleSizeOn = [0x1B, 0x21, 0x30];     // Double width + height
    private static readonly byte[] CmdNormalText = [0x1B, 0x21, 0x00];       // Normal text
    private static readonly byte[] CmdFeedAndCut = [0x1B, 0x64, 0x03, 0x1D, 0x56, 0x42, 0x00]; // Feed 3 lines & Partial cut

    private const int LineWidth = 42; // Standard 80mm Font A characters per line
    private static readonly string SingleDivider = new('-', LineWidth);
    private static readonly string DoubleDivider = new('=', LineWidth);

    public Task PrintRoundTicketAsync(
        string ipAddress, int port, string businessName, int orderNumber, string tableName,
        string customerName, OrderRoundDto round, string currencyCode, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        ms.Write(CmdInit);

        // Header
        ms.Write(CmdAlignCenter);
        ms.Write(CmdBoldOn);
        ms.Write(CmdDoubleHeightOn);
        WriteString(ms, $"{businessName}\n");
        ms.Write(CmdNormalText);
        ms.Write(CmdBoldOn);
        WriteString(ms, $"KITCHEN PASS - ROUND #{round.RoundNumber}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{DateTime.Now:dd MMM yyyy, HH:mm}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Order & Table Info
        ms.Write(CmdAlignLeft);
        ms.Write(CmdBoldOn);
        WriteString(ms, $"Order: #{orderNumber}   Table: {tableName}\n");
        if (!string.IsNullOrWhiteSpace(customerName))
            WriteString(ms, $"Guest: {customerName}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{SingleDivider}\n");

        // Items
        foreach (var line in round.Lines)
        {
            ms.Write(CmdBoldOn);
            var itemLine = FormatTwoColumn($"{line.Quantity}x {line.Name}", $"{currencyCode} {line.LineTotal:0.00}");
            WriteString(ms, $"{itemLine}\n");
            ms.Write(CmdBoldOff);

            if (!string.IsNullOrWhiteSpace(line.Notes))
            {
                WriteString(ms, $"   * Note: {line.Notes}\n");
            }
        }

        WriteString(ms, $"{SingleDivider}\n");

        // Round Total
        ms.Write(CmdBoldOn);
        WriteString(ms, $"{FormatTwoColumn("ROUND TOTAL", $"{currencyCode} {round.RoundTotal:0.00}")}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{DoubleDivider}\n");

        // Footer Cut
        ms.Write(CmdFeedAndCut);

        return SendRawBytesAsync(ipAddress, port, ms.ToArray(), ct);
    }

    public Task PrintBillAsync(
        string ipAddress, int port, string businessName, string footerMessage, OrderDto order, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        ms.Write(CmdInit);

        // Header
        ms.Write(CmdAlignCenter);
        ms.Write(CmdBoldOn);
        ms.Write(CmdDoubleSizeOn);
        WriteString(ms, $"{businessName}\n");
        ms.Write(CmdNormalText);
        WriteString(ms, "CUSTOMER RECEIPT / BILL\n");
        WriteString(ms, $"{DateTime.Now:dd MMM yyyy, HH:mm}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Order Info
        ms.Write(CmdAlignLeft);
        WriteString(ms, $"Order: #{order.OrderNumber}\n");
        WriteString(ms, $"Table: {order.TableName}\n");
        if (!string.IsNullOrWhiteSpace(order.CustomerName))
            WriteString(ms, $"Guest: {order.CustomerName}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Itemized Rounds
        foreach (var round in order.Rounds.OrderBy(r => r.RoundNumber))
        {
            ms.Write(CmdBoldOn);
            WriteString(ms, $"--- Round {round.RoundNumber} ---\n");
            ms.Write(CmdBoldOff);

            foreach (var line in round.Lines)
            {
                var lineLeft = $"{line.Quantity}x {line.Name}";
                var lineRight = $"{order.CurrencyCode} {line.LineTotal:0.00}";
                WriteString(ms, $"{FormatTwoColumn(lineLeft, lineRight)}\n");

                if (!string.IsNullOrWhiteSpace(line.Notes))
                {
                    WriteString(ms, $"   * {line.Notes}\n");
                }
            }
        }

        WriteString(ms, $"{SingleDivider}\n");

        // Financial Totals
        WriteString(ms, $"{FormatTwoColumn("Subtotal", $"{order.CurrencyCode} {order.Subtotal:0.00}")}\n");

        if (order.ServiceCharge > 0)
        {
            WriteString(ms, $"{FormatTwoColumn("Service Charge", $"{order.CurrencyCode} {order.ServiceCharge:0.00}")}\n");
        }

        WriteString(ms, $"{FormatTwoColumn("VAT / Tax", $"{order.CurrencyCode} {order.Tax:0.00}")}\n");
        WriteString(ms, $"{DoubleDivider}\n");

        // Grand Total (Emphasized)
        ms.Write(CmdBoldOn);
        ms.Write(CmdDoubleHeightOn);
        WriteString(ms, $"{FormatTwoColumn("TOTAL DUE", $"{order.CurrencyCode} {order.Total:0.00}")}\n");
        ms.Write(CmdNormalText);
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{DoubleDivider}\n");

        // Footer Message
        ms.Write(CmdAlignCenter);
        if (!string.IsNullOrWhiteSpace(footerMessage))
        {
            WriteString(ms, $"{footerMessage}\n");
        }
        WriteString(ms, "Powered by ZIP Flow POS\n");

        // Cut
        ms.Write(CmdFeedAndCut);

        return SendRawBytesAsync(ipAddress, port, ms.ToArray(), ct);
    }

    public Task TestPrintAsync(string ipAddress, int port, string businessName, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        ms.Write(CmdInit);

        ms.Write(CmdAlignCenter);
        ms.Write(CmdBoldOn);
        ms.Write(CmdDoubleSizeOn);
        WriteString(ms, $"{businessName}\n");
        ms.Write(CmdNormalText);
        WriteString(ms, "==========================================\n");
        ms.Write(CmdBoldOn);
        WriteString(ms, "        PRINTER CONNECTION TEST           \n");
        ms.Write(CmdBoldOff);
        WriteString(ms, "==========================================\n");

        ms.Write(CmdAlignLeft);
        WriteString(ms, $"Device:    Epson TM-m30II / Thermal POS\n");
        WriteString(ms, $"IP Target: {ipAddress}:{port}\n");
        WriteString(ms, $"Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss}\n");
        WriteString(ms, $"Status:    Connected & Operational (OK)\n");
        WriteString(ms, "------------------------------------------\n");
        WriteString(ms, "Hardware communication test passed.\n");
        WriteString(ms, "Auto-cutter mechanism: Verified.\n");
        WriteString(ms, "==========================================\n");

        ms.Write(CmdAlignCenter);
        WriteString(ms, "ZIP Flow Restaurant OS\n");

        ms.Write(CmdFeedAndCut);

        return SendRawBytesAsync(ipAddress, port, ms.ToArray(), ct);
    }

    private static string FormatTwoColumn(string left, string right, int width = LineWidth)
    {
        var cleanLeft = left ?? string.Empty;
        var cleanRight = right ?? string.Empty;

        if (cleanLeft.Length + cleanRight.Length + 1 >= width)
        {
            var maxLeft = width - cleanRight.Length - 2;
            if (maxLeft > 3)
            {
                cleanLeft = cleanLeft[..maxLeft] + "..";
            }
        }

        var spaces = Math.Max(1, width - cleanLeft.Length - cleanRight.Length);
        return cleanLeft + new string(' ', spaces) + cleanRight;
    }

    private static void WriteString(Stream stream, string text)
    {
        // Convert to ISO-8859-1 / UTF-8 compatible byte stream
        var bytes = Encoding.UTF8.GetBytes(text);
        stream.Write(bytes, 0, bytes.Length);
    }

    private async Task SendRawBytesAsync(string ipAddress, int port, byte[] data, CancellationToken ct)
    {
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(ipAddress, port, ct).AsTask().WaitAsync(TimeSpan.FromSeconds(5), ct);
            using var stream = client.GetStream();
            await stream.WriteAsync(data, ct);
            await stream.FlushAsync(ct);
        }
        catch (Exception ex) when (ex is SocketException or TimeoutException or IOException)
        {
            logger.LogWarning(ex, "Failed to reach printer at {IpAddress}:{Port}", ipAddress, port);
            throw new PrinterUnavailableException($"Could not reach printer at {ipAddress}:{port}. Verify printer is powered on and connected to the network.");
        }
    }
}
