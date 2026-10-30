# Farm Data Storage Setup

## Overview
The Add Farm form now saves all data including images to the database. The system supports two storage methods:

1. **Main API** (Primary): Sends data to your backend API
2. **Local JSON Server** (Fallback): Stores data locally in `db.json`

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Start JSON Server (for local storage)
In a separate terminal, run:
```bash
npm run json-server
```
This will start a local server at `http://localhost:3001`

### 3. Start the Application
```bash
npm run dev
```

## How It Works

### Data Storage Flow
1. When a user submits the Add Farm form, the system first tries to save to your main API
2. If the main API is unavailable, it automatically falls back to the local JSON server
3. All data including images are stored in the database

### Stored Data Fields
The following data is stored for each farm:

**Basic Information:**
- First Name, Last Name
- Email, Phone Number
- Address, Village, Taluka, State, District
- PIN Code, GAT Number
- Area, Variety, Plantation Type, Plantation Date

**Irrigation Details:**
- Irrigation Type (Drip/Flood)
- **Drip Irrigation:** Plants per acre, Spacing A & B, Flow rate, Emitters
- **Flood Irrigation:** Motor horsepower, Pipe width, Distance from motor

**Location Data:**
- Latitude and Longitude
- Plot geometry (GeoJSON)

**Documents:**
- All uploaded files (stored as base64 in local storage)

### Database Structure
The farm data is stored in the `farms` array in `db.json`:

```json
{
  "farms": [
    {
      "id": "timestamp",
      "first_Name": "John",
      "last_Name": "Doe",
      "email": "john@example.com",
      "phone_Number": "1234567890",
      "address": "123 Farm Road",
      "village": "Farm Village",
      "taluka": "Farm Taluka",
      "state": "Maharashtra",
      "district": "Pune",
      "pin_code": "411001",
      "gat_No": "123",
      "area": "10 acres",
      "variety": "Sugarcane",
      "plantation_Type": "Organic",
      "plantation_Date": "2025-01-15",
      "irrigation_Type": "drip",
      "plants_Per_Acre": "5000",
      "spacing_A": "1.5",
      "spacing_B": "2.0",
      "flow_Rate": "2.5",
      "emitters": "1000",
      "geometry": "{\"type\":\"Polygon\",\"coordinates\":[...]}",
      "location": {"lat": "18.5204", "lng": "73.8567"},
      "documents": ["data:image/jpeg;base64,..."],
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

## API Endpoints

### Main API (Primary)
- **POST** `/api/addfarm` - Save farm data with file uploads

### Local JSON Server (Fallback)
- **GET** `http://localhost:3001/farms` - Get all farms
- **POST** `http://localhost:3001/farms` - Add new farm
- **GET** `http://localhost:3001/farms/:id` - Get specific farm
- **PUT** `http://localhost:3001/farms/:id` - Update farm
- **DELETE** `http://localhost:3001/farms/:id` - Delete farm

## Features

### Form Validation
- Map drawing is required before submission
- All fields are optional (as requested)
- Real-time validation feedback

### User Experience
- Loading states during submission
- Success/error messages
- Form auto-reset after successful submission
- Disabled buttons during submission

### Image Handling
- Multiple file upload support
- Files converted to base64 for local storage
- FormData used for main API uploads

## Troubleshooting

### JSON Server Not Starting
1. Make sure port 3001 is available
2. Check if `db.json` exists in the root directory
3. Try running: `npx json-server --watch db.json --port 3001`

### Data Not Saving
1. Check browser console for errors
2. Verify JSON server is running
3. Check network tab for API calls

### Images Not Uploading
1. Ensure files are valid image formats
2. Check file size limits
3. Verify FormData is being sent correctly

## Next Steps

To integrate with your main backend API:
1. Update the `API_BASE_URL` in `src/api.ts`
2. Ensure your backend supports multipart/form-data
3. Handle file uploads on the backend
4. Update the `addFarm` function to match your API structure
