# API Endpoints Documentation

This document provides a comprehensive list of all API endpoints used in the CropEye application.

**Last Updated:** Generated from codebase analysis

---

## Table of Contents

1. [Main Backend API (Django/FastAPI)](#main-backend-api)
2. [Admin Service](#admin-service)
3. [Events Service](#events-service)
4. [Weather Service](#weather-service)
5. [SEF Service (Soil Evapotranspiration)](#sef-service)
6. [Main Service](#main-service)
7. [KML/GeoJSON API](#kmlgeojson-api)
8. [Gemini API](#gemini-api)
9. [System Refresh Endpoints](#system-refresh-endpoints)

---

## Main Backend API

**Base URL:** `https://cropeye-backendd.up.railway.app/api`
**Alternative:** Configured via `VITE_API_BASE_URL` environment variable

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/login/` | User login with phone_number and password | No |
| POST | `/token/refresh/` | Refresh authentication token | No (uses refresh token) |

### User Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/users/` | Create new user | Yes |
| GET | `/users/` | Get all users | Yes |
| GET | `/users/me/` | Get current user profile | Yes |
| PATCH | `/users/{id}/` | Update user (partial) | Yes |
| GET | `/users/contact-details/` | Get user contact details | Yes |
| GET | `/users/total-count/` | Get total user counts for dashboard | Yes |
| GET | `/users/team-connect/` | Get team connect data (owners, field officers, farmers) | Yes |
| GET | `/users/team-connect/?industry_id={id}` | Get team connect data filtered by industry | Yes |
| GET | `/users/farmers-by-field-officer/{fieldOfficerId}/` | Get farmers assigned to a field officer | Yes |
| GET | `/users/owner-hierarchy/` | Get owner hierarchy data | Yes |
| GET | `/users/my-field-officers/` | Get field officers for current user | Yes |

### Farm Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/farms/` | Get all farms | Yes |
| GET | `/farms/?include_farmer=true` | Get farms with farmer details | Yes |
| GET | `/farms/?farmer_id={farmerId}` | Get farms by farmer ID | Yes |
| GET | `/farms/{id}/` | Get farm by ID | Yes |
| POST | `/farms/` | Create new farm (multipart/form-data for file uploads) | Yes |
| PUT | `/farms/{id}/` | Update farm (full update) | Yes |
| PATCH | `/farms/{id}/` | Update farm (partial update) | Yes |
| DELETE | `/farms/{id}/` | Delete farm | Yes |
| GET | `/farms/geojson/` | Get farms as GeoJSON | Yes |
| GET | `/farms/recent-farmers/` | Get recent farmers | Yes |
| GET | `/farms/my-profile/` | Get farmer profile | Yes |
| POST | `/farms/register-farmer/` | Register farmer (all-in-one endpoint) | Yes |

### Plot Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/plots/` | Create new plot | Yes |
| PATCH | `/plots/{id}/` | Update plot (partial update) | Yes |
| GET | `/farm-plots/` | Get all farm plots | Yes |
| POST | `/farm-plots/` | Create farm plot | Yes |
| GET | `/farm-plots/geojson/` | Get farm plots as GeoJSON | Yes |

### Irrigation Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| PATCH | `/irrigations/{id}/` | Update irrigation (partial update) | Yes |

### Task Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/tasks/` | Get all tasks | Yes |
| GET | `/tasks/?assigned_to_id={userId}` | Get tasks for specific user | Yes |
| GET | `/tasks/{id}/` | Get task by ID | Yes |
| POST | `/tasks/` | Create new task | Yes |
| PUT | `/tasks/{id}/` | Update task (full update) | Yes |
| PATCH | `/tasks/{id}/` | Update task status (partial update) | Yes |

### Vendor Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/vendors/` | Get all vendors | Yes |
| POST | `/vendors/` | Create new vendor | Yes |
| PATCH | `/vendors/{id}/` | Update vendor (partial update) | Yes |
| DELETE | `/vendors/{id}/` | Delete vendor | Yes |

### Order Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/orders/` | Get all orders | Yes |
| POST | `/orders/` | Create new order | Yes |
| PUT | `/orders/{id}/` | Update order (full update) | Yes |
| PATCH | `/orders/{id}/` | Update order (partial update) | Yes |
| DELETE | `/orders/{id}/` | Delete order | Yes |

### Stock Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/stock/` | Get all stock items | Yes |
| POST | `/stock/` | Create new stock item | Yes |
| PATCH | `/stock/{id}/` | Update stock item (partial update) | Yes |
| DELETE | `/stock/{id}/` | Delete stock item | Yes |

### Booking Management Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/bookings/` | Get all bookings | Yes |
| POST | `/bookings/` | Create new booking | Yes |
| PATCH | `/bookings/{id}/` | Update booking (partial update) | Yes |
| DELETE | `/bookings/{id}/` | Delete booking | Yes |

### Messaging Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/messages/` | Send message | Yes |
| GET | `/conversations/` | Get all conversations | Yes |
| GET | `/conversations/with-user/{userId}/` | Get conversation with specific user | Yes |
| GET | `/conversations/{conversationId}/messages/` | Get messages for a conversation | Yes |

### Reference Data Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/soil-types/` | Get all soil types | Yes |
| GET | `/crop-types/` | Get all crop types | Yes |

---

## Admin Service

**Base URL:** `https://admin-cropeye.up.railway.app`

### Field Analysis Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/analyze_Growth?plot_name={plotName}&end_date={date}&days_back={days}` | Analyze crop growth data | No |
| POST | `/wateruptake?plot_name={plotName}&end_date={date}&days_back={days}` | Get water uptake data | No |
| POST | `/SoilMoisture?plot_name={plotName}&end_date={date}&days_back={days}` | Get soil moisture data | No |
| POST | `/pest-detection?plot_name={plotName}&end_date={date}&days_back={days}` | Get pest detection data | No |
| POST | `/analyze?plot_name={plotName}&date={date}` | General field analysis | No |
| POST | `/refresh-from-django` | Refresh data from Django backend | No |

**Example:**
```
POST https://admin-cropeye.up.railway.app/analyze_Growth?plot_name=294724&end_date=2024-01-15&days_back=7
```

---

## Events Service

**Base URL:** `https://events-cropeye.up.railway.app`

### Plot Data Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/plots/{plotId}/indices` | Get plot indices (NDVI, NDMI, NDWI, NDRE) | No |
| GET | `/plots/{plotId}/stress?index_type={type}&threshold={value}` | Get stress events for plot | No |
| GET | `/plots/{plotId}/irrigation?threshold_ndmi={value}&threshold_ndwi={value}&min_days_between_events={days}` | Get irrigation recommendations | No |
| GET | `/plots/agroStats?end_date={date}` | Get agricultural statistics | No |
| POST | `/refresh-from-django` | Refresh data from Django backend | No |

**Example:**
```
GET https://events-cropeye.up.railway.app/plots/294724/indices
GET https://events-cropeye.up.railway.app/plots/294724/stress?index_type=NDRE&threshold=0.15
GET https://events-cropeye.up.railway.app/plots/agroStats?end_date=2024-01-15
```

---

## Weather Service

**Base URL:** `https://weather-cropeye.up.railway.app`

### Weather Data Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/current-weather?lat={latitude}&lon={longitude}` | Get current weather data | No |
| GET | `/forecast?lat={latitude}&lon={longitude}` | Get 7-day weather forecast | No |

**Example:**
```
GET https://weather-cropeye.up.railway.app/current-weather?lat=17.5789&lon=75.053
GET https://weather-cropeye.up.railway.app/forecast?lat=17.5789&lon=75.053
```

**Response Format (Current Weather):**
```json
{
  "location": "City Name",
  "region": "Region",
  "country": "Country",
  "localtime": "2024-01-15 12:00:00",
  "latitude": 17.5789,
  "longitude": 75.053,
  "temperature_c": 28.5,
  "humidity": 65,
  "wind_kph": 15.2,
  "precip_mm": 0.0
}
```

---

## SEF Service

**Base URL:** `https://sef-cropeye.up.railway.app`

### Soil & Evapotranspiration Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/plots/{plotName}/compute-et/` | Compute evapotranspiration for plot | No |
| GET | `/soil-moisture/{plotName}` | Get soil moisture stack data (multiple formats attempted) | No |
| GET | `/soil-moisture/{plotName}/` | Get soil moisture stack data (with trailing slash) | No |
| GET | `/soil-moisture?plot_name={plotName}` | Get soil moisture stack data (query param) | No |
| POST | `/soil-moisture/{plotName}` | Get soil moisture stack data (POST method) | No |
| POST | `/soil-moisture` | Get soil moisture stack data (POST with body) | No |
| POST | `/analyze?plot_name={plotName}&end_date={date}&days_back={days}` | General field analysis | No |
| POST | `/refresh-from-django` | Refresh data from Django backend | No |

**Example:**
```
POST https://sef-cropeye.up.railway.app/plots/294724/compute-et/
GET https://sef-cropeye.up.railway.app/soil-moisture/294724
POST https://sef-cropeye.up.railway.app/analyze?plot_name=294724&end_date=2024-01-15&days_back=7
```

**Note:** The soil moisture endpoint attempts multiple URL formats for compatibility.

---

## Main Service

**Base URL:** `https://main-cropeye.up.railway.app`

### Soil Analysis Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/analyze-npk/{plotName}?end_date={date}&days_back={days}` | Analyze soil NPK (Nitrogen, Phosphorus, Potassium) | No |
| POST | `/required-n/{plotName}?end_date={date}` | Get required nitrogen data | No |
| POST | `/analyze?plot_name={plotName}&date={date}&fe_days_back={days}` | General field analysis with iron data | No |
| POST | `/refresh-from-django` | Refresh data from Django backend | No |

**Example:**
```
POST https://main-cropeye.up.railway.app/analyze-npk/294724?end_date=2024-01-15&days_back=7
POST https://main-cropeye.up.railway.app/required-n/294724?end_date=2024-01-15
```

---

## KML/GeoJSON API

**Base URL:** `http://192.168.41.51`

### GeoJSON Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get KML/GeoJSON data | No |

**Note:** This is a local network endpoint, typically used for internal data access.

---

## Gemini API

**Base URL:** `https://generativelanguage.googleapis.com/v1beta`

### AI/ML Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/models/{modelName}:generateContent?key={apiKey}` | Generate content using Gemini AI | Yes (API Key) |

**Example:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={API_KEY}
```

**Used For:**
- Live API voice interactions
- Screen analysis
- AI-powered chatbot features

**Note:** API key is required and should be stored in environment variable `VITE_GEMINI_API_KEY`.

---

## System Refresh Endpoints

These endpoints are called after farm/plot registration to refresh microservices:

| Service | Endpoint | Description |
|---------|----------|-------------|
| Admin Service | `https://admin-cropeye.up.railway.app/refresh-from-django` | Refresh admin service data |
| Main Service | `https://main-cropeye.up.railway.app/refresh-from-django` | Refresh main service data |
| Events Service | `https://events-cropeye.up.railway.app/refresh-from-django` | Refresh events service data |
| SEF Service | `https://sef-cropeye.up.railway.app/refresh-from-django` | Refresh SEF service data |

**Method:** POST
**Auth Required:** Yes (uses main API authentication)

---

## Endpoint Summary

### Total Endpoints by Category

- **Main Backend API:** 50+ endpoints
- **Admin Service:** 6 endpoints
- **Events Service:** 5 endpoints
- **Weather Service:** 2 endpoints
- **SEF Service:** 7 endpoints
- **Main Service:** 4 endpoints
- **KML/GeoJSON API:** 1 endpoint
- **Gemini API:** 1 endpoint
- **System Refresh:** 4 endpoints

**Total: ~80 endpoints**

### Authentication Methods

1. **Bearer Token Authentication:** Most endpoints use JWT Bearer tokens
   - Token stored in localStorage
   - Auto-refresh mechanism implemented
   - Header format: `Authorization: Bearer {token}`

2. **API Key Authentication:** Gemini API uses query parameter API key

3. **Public Endpoints:** Some endpoints (weather, field analysis) don't require authentication

### HTTP Methods Used

- **GET:** Retrieve data
- **POST:** Create new resources or trigger actions
- **PUT:** Full update of resources
- **PATCH:** Partial update of resources
- **DELETE:** Delete resources

### Common Query Parameters

- `plot_name`: Plot identifier (string)
- `end_date`: End date in YYYY-MM-DD format
- `start_date`: Start date in YYYY-MM-DD format
- `days_back`: Number of days to look back (integer)
- `lat`: Latitude (decimal)
- `lon`: Longitude (decimal)
- `index_type`: Index type (e.g., "NDRE", "NDVI")
- `threshold`: Threshold value (decimal)
- `farmer_id`: Farmer ID (integer/string)
- `industry_id`: Industry ID (integer)

### Response Formats

- **JSON:** Most endpoints return JSON
- **GeoJSON:** Map-related endpoints return GeoJSON format
- **Multipart/Form-Data:** File upload endpoints

### Error Handling

- **401 Unauthorized:** Authentication required or token expired
- **403 Forbidden:** Insufficient permissions
- **404 Not Found:** Resource not found
- **500 Internal Server Error:** Server error

### CORS Configuration

Most external services (Railway apps) support CORS. The main backend API handles CORS for authenticated requests.

---

## Development/Testing Endpoints

### Local Development

Some components reference local endpoints for testing:

- `http://localhost:5000` - Local backend (commented out in most places)
- `http://192.168.41.120:1002` - Local network testing endpoints
- `/api/dev-plot` - Vite proxy for development (configured in `vite.config.ts`)

---

## Notes

1. **Base URL Configuration:** The main API base URL can be configured via `VITE_API_BASE_URL` environment variable. Default is `https://cropeye-backendd.up.railway.app/api`.

2. **Token Refresh:** The application implements automatic token refresh. If a token expires, it attempts to refresh using the refresh token before retrying the request.

3. **Caching:** Some endpoints implement caching to improve performance. Cache keys are typically in the format: `{dataType}_{plotName}` or `{dataType}_{plotId}`.

4. **Retry Logic:** Some critical endpoints implement retry logic with exponential backoff for failed requests.

5. **Timeout Handling:** External service calls have timeout protection (typically 10-30 seconds) to prevent hanging requests.

6. **Pre-fetching:** The application pre-fetches commonly used data on login to improve user experience.

---

## Environment Variables

Required environment variables:

- `VITE_API_BASE_URL`: Main backend API base URL (optional, has default)
- `VITE_GEMINI_API_KEY`: Gemini API key for AI features (required for Live API)

---

## API Versioning

Currently, the APIs do not appear to use explicit versioning in the URL paths. Future versions may include version numbers (e.g., `/api/v1/`).

---

**Documentation Generated:** From comprehensive codebase analysis
**Maintained By:** Development Team
**For Questions:** Contact the development team or refer to the API source code in `src/api.ts`
