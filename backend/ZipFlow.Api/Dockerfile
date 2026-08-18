FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ZipFlow.Api.csproj ./
RUN dotnet restore ZipFlow.Api.csproj
COPY . .
RUN dotnet publish ZipFlow.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "ZipFlow.Api.dll"]
