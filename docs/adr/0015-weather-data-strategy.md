# Weather data comes from Open-Meteo (free, keyless): live forecast within ~16 days, archive "typical" beyond, daylight computed offline

Open-Meteo supplies weather for the day view — live forecast for dates within approximately 16 days of today, and a previous-year archive reading labelled "typical" for dates further out. Both paths are in-memory cached and treated as best-effort (null on any fetch failure). Sunrise/sunset and day-length are derived entirely offline from the NOAA solar algorithm (lat/lng + date) so daylight always works without network access.

## Considered Options

- **Forecast-only, leave far-future dates blank.** Rejected: trips are planned months in advance; blank weather on every future stop makes the card useless for the majority of use cases.
- **A keyed provider such as OpenWeather.** Rejected: key management, rate-limit monitoring, and secret rotation add meaningful operational overhead for a two-person app where Open-Meteo's free, keyless API covers the same data.
- **Derive daylight from the weather API response.** Rejected: the API cannot be called offline and carries a rate-limit; the NOAA formula is a pure function of lat/lng and date, costs nothing, and never fails due to network conditions.

## Consequences

- Weather is best-effort: any fetch failure returns null and the card renders only daylight. Results are cached in memory for the process lifetime (forecast: 1 h revalidation; typical: 24 h).
- Temperatures are °C only; no unit toggle.
- Open-Meteo data is licensed CC-BY — attribution ("Weather by Open-Meteo") is required wherever weather data is displayed.
