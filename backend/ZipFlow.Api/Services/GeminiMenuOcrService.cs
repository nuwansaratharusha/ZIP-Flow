using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ZipFlow.Api.Services;

/// <summary>One item read off a menu photo by Gemini (before SKU/category resolution).</summary>
public sealed record OcrMenuItem(string Category, string Name, decimal Price);

public interface IMenuOcrService
{
    bool IsConfigured { get; }
    Task<IReadOnlyList<OcrMenuItem>> ExtractAsync(byte[] imageBytes, string mimeType, CancellationToken ct);
}

/// <summary>
/// Reads a photo of a (possibly handwritten) menu/price list with Google Gemini and
/// returns structured items. Uses Gemini's JSON schema mode so the model must return
/// clean, parseable output — no free-text scraping.
/// </summary>
public sealed class GeminiMenuOcrService(
    HttpClient http, IConfiguration config, ILogger<GeminiMenuOcrService> logger) : IMenuOcrService
{
    private readonly string _apiKey = config["Gemini:ApiKey"] ?? string.Empty;
    private readonly string _model = string.IsNullOrWhiteSpace(config["Gemini:Model"])
        ? "gemini-2.0-flash"
        : config["Gemini:Model"]!;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    private const string Prompt = """
        You are reading a photo of a restaurant menu or price list. It may be handwritten.
        Extract every distinct sellable item that has a price.
        For each item return: category (a sensible group such as Starters, Mains, Drinks, Wine),
        name, and price as a plain number in the menu's currency.
        If one drink lists several measures (e.g. 175ml and 250ml at different prices), output
        one item per measure and put the measure in the name (e.g. "Sauvignon Blanc 175ml").
        Ignore section headings, addresses, phone numbers and anything without a price.
        """;

    public async Task<IReadOnlyList<OcrMenuItem>> ExtractAsync(byte[] imageBytes, string mimeType, CancellationToken ct)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Gemini is not configured. Set Gemini__ApiKey in the environment.");

        var body = new
        {
            contents = new[]
            {
                new
                {
                    parts = new object[]
                    {
                        new { text = Prompt },
                        new { inline_data = new { mime_type = mimeType, data = Convert.ToBase64String(imageBytes) } },
                    },
                },
            },
            generationConfig = new
            {
                responseMimeType = "application/json",
                responseSchema = new
                {
                    type = "OBJECT",
                    properties = new
                    {
                        items = new
                        {
                            type = "ARRAY",
                            items = new
                            {
                                type = "OBJECT",
                                properties = new
                                {
                                    category = new { type = "STRING" },
                                    name = new { type = "STRING" },
                                    price = new { type = "NUMBER" },
                                },
                                required = new[] { "category", "name", "price" },
                            },
                        },
                    },
                    required = new[] { "items" },
                },
            },
        };

        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";

        using var resp = await http.PostAsJsonAsync(url, body, ct);
        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("Gemini OCR failed: {Status} {Body}", (int)resp.StatusCode, raw);
            throw new InvalidOperationException($"Gemini request failed ({(int)resp.StatusCode}).");
        }

        string json;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var candidates = doc.RootElement.GetProperty("candidates");
            if (candidates.GetArrayLength() == 0)
                return [];
            json = candidates[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? "{}";
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Unexpected Gemini response shape: {Body}", raw);
            throw new InvalidOperationException("Could not read Gemini's response.");
        }

        var parsed = JsonSerializer.Deserialize<OcrResult>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        return parsed?.Items?
            .Where(i => !string.IsNullOrWhiteSpace(i.Name) && i.Price >= 0)
            .Select(i => new OcrMenuItem(
                string.IsNullOrWhiteSpace(i.Category) ? "Uncategorised" : i.Category.Trim(),
                i.Name.Trim(),
                decimal.Round(i.Price, 2)))
            .ToList() ?? [];
    }

    private sealed class OcrResult
    {
        [JsonPropertyName("items")] public List<Raw>? Items { get; set; }
    }

    private sealed class Raw
    {
        [JsonPropertyName("category")] public string Category { get; set; } = string.Empty;
        [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
        [JsonPropertyName("price")] public decimal Price { get; set; }
    }
}
