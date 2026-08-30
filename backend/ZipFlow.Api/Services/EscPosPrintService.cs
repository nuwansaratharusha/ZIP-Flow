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
/// over TCP port 9100. Formatted strictly for standard 80mm / 42-column restaurant invoice layouts.
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

    public Task PrintRoundTicketAsync(
        string ipAddress, int port, string businessName, int orderNumber, string tableName,
        string customerName, OrderRoundDto round, string currencyCode, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        ms.Write(CmdInit);

        // Header
        ms.Write(CmdAlignCenter);
        ms.Write(CmdBoldOn);
        WriteString(ms, $"{businessName.ToUpperInvariant()}\n");
        ms.Write(CmdNormalText);
        WriteString(ms, $"{SingleDivider}\n");
        ms.Write(CmdBoldOn);
        WriteString(ms, $"KITCHEN PASS - ROUND #{round.RoundNumber}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{DateTime.Now:dd-MM-yyyy   HH:mm:ss}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Order & Table Info
        ms.Write(CmdAlignLeft);
        var orderCode = $"G{orderNumber:D8}";
        WriteString(ms, $"{FormatTwoColumn(orderCode, $"Table: {tableName}")}\n");
        if (!string.IsNullOrWhiteSpace(customerName))
            WriteString(ms, $"Guest: {customerName}\n");
        WriteString(ms, $"{SingleDivider}\n\n");

        // Items
        int roundItemCount = 0;
        foreach (var line in round.Lines)
        {
            roundItemCount += line.Quantity;
            ms.Write(CmdBoldOn);
            WriteString(ms, $"{line.Name.ToUpperInvariant()}\n");
            ms.Write(CmdBoldOff);

            var qtyStr = $"{line.Quantity:0.00}";
            var unitPriceStr = $"{line.Price:0.00}";
            var totalStr = $"{line.LineTotal:0.00}";
            WriteString(ms, $"{FormatThreeColumn(qtyStr, unitPriceStr, totalStr)}\n");

            if (!string.IsNullOrWhiteSpace(line.Notes))
            {
                WriteString(ms, $"   * Note: {line.Notes}\n");
            }
            WriteString(ms, "\n");
        }

        WriteString(ms, $"{SingleDivider}\n");

        // Round Total
        ms.Write(CmdBoldOn);
        WriteString(ms, $"{FormatTwoColumn("ROUND TOTAL", $"{round.RoundTotal:0.00}")}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{FormatTwoColumn("* NUMBER OF ITEM", $"{roundItemCount}")}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Footer Cut
        ms.Write(CmdFeedAndCut);

        return SendRawBytesAsync(ipAddress, port, ms.ToArray(), ct);
    }

    public Task PrintBillAsync(
        string ipAddress, int port, string businessName, string footerMessage, OrderDto order, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        ms.Write(CmdInit);

        // Header (Centered Restaurant Branding)
        ms.Write(CmdAlignCenter);
        ms.Write(CmdBoldOn);
        WriteString(ms, $"{businessName.ToUpperInvariant()}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{SingleDivider}\n");

        // Document Title
        ms.Write(CmdBoldOn);
        WriteString(ms, "SALES INVOICE\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{SingleDivider}\n");

        // Metadata Header Line: [Invoice/Order#] [Date] [Time]
        ms.Write(CmdAlignLeft);
        var orderCode = $"G{order.OrderNumber:D8}";
        var dateStr = order.CreatedAt.ToString("dd-MM-yyyy");
        var timeStr = order.CreatedAt.ToString("HH:mm:ss");

        var metaLeft = $"{orderCode}    {dateStr}";
        WriteString(ms, $"{FormatTwoColumn(metaLeft, timeStr)}\n");
        if (!string.IsNullOrWhiteSpace(order.TableName))
        {
            var tableDisplay = $"Table: {order.TableName}";
            var guestDisplay = string.IsNullOrWhiteSpace(order.CustomerName) ? "" : $"Guest: {order.CustomerName}";
            WriteString(ms, $"{FormatTwoColumn(tableDisplay, guestDisplay)}\n");
        }
        WriteString(ms, "\n");

        // Itemized Lines
        int totalItemCount = 0;
        foreach (var round in order.Rounds.OrderBy(r => r.RoundNumber))
        {
            foreach (var line in round.Lines)
            {
                totalItemCount += line.Quantity;

                // Line 1: Item Name in Uppercase
                ms.Write(CmdBoldOn);
                WriteString(ms, $"{line.Name.ToUpperInvariant()}\n");
                ms.Write(CmdBoldOff);

                // Line 2: 3 Columns (Quantity, Unit Price, Line Total)
                var qtyStr = $"{line.Quantity:0.00}";
                var unitPriceStr = $"{line.Price:0.00}";
                var totalStr = $"{line.LineTotal:0.00}";
                WriteString(ms, $"{FormatThreeColumn(qtyStr, unitPriceStr, totalStr)}\n");

                if (!string.IsNullOrWhiteSpace(line.Notes))
                {
                    WriteString(ms, $"   * Note: {line.Notes}\n");
                }
                WriteString(ms, "\n");
            }
        }

        WriteString(ms, $"{SingleDivider}\n");

        // NET AMOUNT
        ms.Write(CmdBoldOn);
        WriteString(ms, $"{FormatTwoColumn("NET AMOUNT", $"{order.Total:0.00}")}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, "\n");

        // Payment Method Breakdown Lines
        WriteString(ms, $"{FormatTwoColumn("CASH", $"{order.Total:0.00}")}\n");
        WriteString(ms, "CHEQUE\n");
        WriteString(ms, "CREDIT\n");
        WriteString(ms, "OTHER\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Tended and Balance
        WriteString(ms, $"{FormatTwoColumn("TENDED", $"{order.Total:0.00}")}\n");
        WriteString(ms, $"{FormatTwoColumn("BALANCE", "0.00")}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Summary Stats
        WriteString(ms, $"{FormatTwoColumn("* TOTAL DISCOUNT", "0.00")}\n");
        WriteString(ms, $"{FormatTwoColumn("* NUMBER OF ITEM", $"{totalItemCount}")}\n");
        WriteString(ms, $"{SingleDivider}\n");
        WriteString(ms, $"{FormatTwoColumn("TOTAL CREDIT", "0.00")}\n");
        WriteString(ms, $"{SingleDivider}\n");

        // Footer Message
        ms.Write(CmdAlignCenter);
        var message = string.IsNullOrWhiteSpace(footerMessage) ? "Thanks and Come again!!!!" : footerMessage;
        WriteString(ms, $"{message}\n\n");
        WriteString(ms, "Software By ZIP Flow POS\n");
        WriteString(ms, $"{SingleDivider}\n");

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
        WriteString(ms, $"{businessName.ToUpperInvariant()}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{SingleDivider}\n");
        ms.Write(CmdBoldOn);
        WriteString(ms, "SALES INVOICE\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, $"{SingleDivider}\n");

        ms.Write(CmdAlignLeft);
        var orderCode = "G000030140";
        var dateStr = DateTime.Now.ToString("dd-MM-yyyy");
        var timeStr = DateTime.Now.ToString("HH:mm:ss");
        WriteString(ms, $"{FormatTwoColumn($"{orderCode}    {dateStr}", timeStr)}\n\n");

        // Sample Items
        WriteString(ms, "CHICKEN OR FRIED NOODLES\n");
        WriteString(ms, $"{FormatThreeColumn("1.00", "750.00", "750.00")}\n\n");

        WriteString(ms, "MIXED FRUIT JUICE\n");
        WriteString(ms, $"{FormatThreeColumn("1.00", "599.99", "599.99")}\n\n");

        WriteString(ms, "WATER BOTTLE 500ML\n");
        WriteString(ms, $"{FormatThreeColumn("1.00", "149.98", "149.98")}\n\n");

        WriteString(ms, $"{SingleDivider}\n");
        ms.Write(CmdBoldOn);
        WriteString(ms, $"{FormatTwoColumn("NET AMOUNT", "1499.97")}\n");
        ms.Write(CmdBoldOff);
        WriteString(ms, "\n");

        WriteString(ms, $"{FormatTwoColumn("CASH", "1499.98")}\n");
        WriteString(ms, "CHEQUE\n");
        WriteString(ms, "CREDIT\n");
        WriteString(ms, "OTHER\n");
        WriteString(ms, $"{SingleDivider}\n");
        WriteString(ms, $"{FormatTwoColumn("TENDED", "1499.98")}\n");
        WriteString(ms, $"{FormatTwoColumn("BALANCE", "0.00")}\n");
        WriteString(ms, $"{SingleDivider}\n");
        WriteString(ms, $"{FormatTwoColumn("* TOTAL DISCOUNT", "0.00")}\n");
        WriteString(ms, $"{FormatTwoColumn("* NUMBER OF ITEM", "3")}\n");
        WriteString(ms, $"{SingleDivider}\n");
        WriteString(ms, $"{FormatTwoColumn("TOTAL CREDIT", "0.00")}\n");
        WriteString(ms, $"{SingleDivider}\n");

        ms.Write(CmdAlignCenter);
        WriteString(ms, "Thanks and Come again!!!!\n\n");
        WriteString(ms, "Software By ZIP Flow POS\n");
        WriteString(ms, $"{SingleDivider}\n");

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

    private static string FormatThreeColumn(string col1, string col2, string col3, int width = LineWidth)
    {
        var c1 = col1 ?? string.Empty;
        var c2 = col2 ?? string.Empty;
        var c3 = col3 ?? string.Empty;

        const int col1Width = 10;
        const int col2Width = 18;

        var part1 = c1.PadRight(col1Width);
        var part2 = c2.PadRight(col2Width);
        var part3Len = Math.Max(0, width - col1Width - col2Width);
        var part3 = c3.PadLeft(part3Len);

        return part1 + part2 + part3;
    }

    private static void WriteString(Stream stream, string text)
    {
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
