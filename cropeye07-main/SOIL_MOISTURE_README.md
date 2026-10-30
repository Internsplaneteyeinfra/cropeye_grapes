# Soil Moisture Trend Card Integration

## Overview
The SoilMoistureTrendCard component has been updated to fetch dynamic 7-day soil moisture data from the API endpoint `http://172.20.10.2:1002/soil-moisture` based on the selected plot.

## Changes Made

### 1. SoilMoistureTrendCard.tsx
- **API Integration**: Updated to fetch from `http://172.20.10.2:1002/soil-moisture`
- **Dynamic Data**: 7-day soil moisture trend now updates based on API response
- **Plot Selection**: Shows plot name in the header when a plot is selected
- **Error Handling**: Added comprehensive error handling and loading states
- **Data Transformation**: Handles multiple API response formats
- **Fallback Data**: Shows mock data when no plot is selected or API fails

### 2. Irrigation.tsx
- **Props Interface**: Added `selectedPlotName` prop
- **Plot Indicator**: Shows selected plot in the header
- **Data Flow**: Passes selected plot to SoilMoistureTrendCard

### 3. App.tsx
- **State Management**: Added `selectedPlotName` state
- **Data Flow**: Passes selected plot from Map component to Irrigation component
- **Integration**: Connected plot selection across components

### 4. CSS Styling
- **Plot Indicator**: Added styling for plot name display
- **Visual Feedback**: Enhanced UI for plot selection

## API Integration

### Endpoint
- **URL**: `http://172.20.10.2:1002/soil-moisture`
- **Method**: GET
- **Parameters**:
  - `plot_name` (string): Plot identifier
  - `start_date` (string): Start date in YYYY-MM-DD format
  - `end_date` (string): End date in YYYY-MM-DD format

### Example Request
```
GET http://172.20.10.2:1002/soil-moisture?plot_name=294724&start_date=2024-01-01&end_date=2024-01-07
```

### Expected API Response Formats

#### Format 1: Array of Data Points
```json
{
  "data": [
    {"date": "2024-01-01", "moisture": 65},
    {"date": "2024-01-02", "moisture": 58},
    {"date": "2024-01-03", "moisture": 50},
    {"date": "2024-01-04", "moisture": 47},
    {"date": "2024-01-05", "moisture": 55},
    {"date": "2024-01-06", "moisture": 63},
    {"date": "2024-01-07", "moisture": 68}
  ]
}
```

#### Format 2: Object with Date Keys
```json
{
  "soil_moisture_data": {
    "2024-01-01": 65,
    "2024-01-02": 58,
    "2024-01-03": 50,
    "2024-01-04": 47,
    "2024-01-05": 55,
    "2024-01-06": 63,
    "2024-01-07": 68
  }
}
```

## How to Test

### 1. Start the Application
```bash
npm run dev
```

### 2. Test Plot Selection Flow
1. **Login as Farmer**: Access the Farmer dashboard
2. **Select Plot**: In the Map component, choose a plot (294724, 289138, or 294725)
3. **Navigate to Irrigation**: Click on "Irrigation" in the sidebar
4. **Verify Updates**: Check that the SoilMoistureTrendCard shows:
   - Plot name in the header
   - Loading state while fetching data
   - 7-day trend chart with dynamic values
   - Color-coded optimal range (60-80%)

### 3. Test API Directly
Open `test-soil-moisture-api.html` in a browser to test the API endpoint directly.

### 4. Test Different Plots
- Select different plots from the Map component
- Navigate to Irrigation page
- Verify that the soil moisture trend changes for each plot

## Features

### Dynamic Data Fetching
- **Automatic Updates**: Fetches data when plot selection changes
- **Date Range**: Automatically calculates last 7 days
- **Real-time**: Updates chart with actual API data

### Visual Indicators
- **Plot Name**: Shows selected plot in header
- **Loading State**: Displays loading indicator during API calls
- **Error Handling**: Shows error messages if API fails
- **Optimal Range**: Highlights 60-80% optimal moisture range

### Fallback Behavior
- **No Plot Selected**: Shows default mock data
- **API Failure**: Falls back to mock data with error message
- **Incomplete Data**: Fills missing days with generated data

## Troubleshooting

### Soil Moisture Card Not Updating
- **Issue**: Chart doesn't change when selecting different plots
- **Solution**:
  1. Check browser console for API errors
  2. Verify plot names match exactly
  3. Test API with `test-soil-moisture-api.html`

### API Connection Issues
- **Issue**: "Failed to fetch soil moisture data" error
- **Solution**:
  1. Verify API server is running on `172.20.10.2:1002`
  2. Check CORS settings on the API server
  3. Test with `test-soil-moisture-api.html`

### No Data Displayed
- **Issue**: Chart shows no data or empty chart
- **Solution**:
  1. Check API response format matches expected structure
  2. Verify date parameters are correct
  3. Check browser console for data transformation errors

## Available Plot Names
- 294724
- 289138
- 294725

## Debug Information
In development mode, the SoilMoistureTrendCard shows debug information including:
- Selected plot name
- Number of data points
- Latest moisture value

## File Structure
```
src/components/
├── Irrigation/
│   ├── Irrigation.tsx                    # Main irrigation component
│   ├── cards/
│   │   └── SoilMoistureTrendCard.tsx     # Soil moisture trend card
│   └── Irrigation.css                    # Styling
├── App.tsx                               # Main app with state management
└── Map.tsx                               # Map component with plot selection

test-soil-moisture-api.html               # API testing utility
```

## Data Flow
1. **Plot Selection**: User selects plot in Map component
2. **State Update**: App.tsx updates `selectedPlotName` state
3. **Component Update**: Irrigation component receives selected plot
4. **API Call**: SoilMoistureTrendCard fetches 7-day data
5. **Chart Update**: Chart displays dynamic soil moisture trend

## Performance Considerations
- **Caching**: Consider implementing data caching for frequently accessed plots
- **Refresh**: Data refreshes when plot selection changes
- **Error Recovery**: Graceful fallback to mock data on API failures
