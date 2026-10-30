# Soil Analysis Integration

## Overview
The SoilAnalysis component has been updated to fetch dynamic soil data from the API endpoint `http://192.168.41.120:1002/analyze` based on the selected plot.

## Changes Made

### 1. SoilAnalysis.tsx
- **API Integration**: Updated to fetch from `http://192.168.41.120:1002/analyze?plot_name={selectedPlot}`
- **Dynamic Values**: All soil parameters now update based on API response
- **Card Styling**: Added proper card styling to match other components
- **Error Handling**: Added comprehensive error handling and loading states
- **Debug Mode**: Added debug section in development mode

### 2. FarmerHomeGrid.tsx
- **Plot Selection**: Added state to track selected plot name
- **Data Flow**: Properly passes selected plot to SoilAnalysis component
- **Layout**: Improved grid layout and spacing

### 3. API Response Format
Expected JSON response from the API:
```json
{
  "nitrogen": 55,
  "phosphorus": 6,
  "potassium": 103,
  "pH": 6.5,
  "cec": 7.7,
  "organic_carbon": 2,
  "soil_density": 2,
  "ocd": 3.5,
  "soc": 0.6,
  "plot_name": "294724"
}
```

## How to Test

### 1. Start the Application
```bash
npm run dev
```

### 2. Navigate to Farmer View
- Login as a Farmer user
- The FarmerHomeGrid will be displayed

### 3. Test Plot Selection
- In the Map component, select a plot from the dropdown:
  - 294724
  - 289138
  - 294725

### 4. Verify Soil Analysis Updates
- The SoilAnalysis card should display on the right side
- When a plot is selected, the card should show:
  - Loading state while fetching data
  - Dynamic soil analysis values
  - Charts and metrics based on API data
  - Color-coded levels (Very Low, Low, Medium, Optimal, Very High)

### 5. Test API Directly
Open `test-api.html` in a browser to test the API endpoint directly.

## Troubleshooting

### Soil Analysis Card Not Displaying
- **Issue**: Card not visible
- **Solution**: The card should always be visible. Check browser console for errors.

### API Connection Issues
- **Issue**: "Failed to fetch soil data" error
- **Solution**:
  1. Verify API server is running on `192.168.41.120:1002`
  2. Check CORS settings on the API server
  3. Test with `test-api.html`

### No Data Updates
- **Issue**: Values don't change when selecting different plots
- **Solution**:
  1. Check browser console for API response
  2. Verify plot names match exactly (294724, 289138, 294725)
  3. Check API response format matches expected structure

## Available Plot Names
- 294724
- 289138
- 294725

## Debug Information
In development mode, the SoilAnalysis component shows a debug section with the raw API response data.

## File Structure
```
src/components/
├── SoilAnalysis.tsx          # Main soil analysis component
├── FarmerHomeGrid.tsx        # Farmer dashboard layout
└── Map.tsx                   # Map component with plot selection

test-api.html                 # API testing utility
```

## API Endpoint
- **URL**: `http://192.168.41.120:1002/analyze`
- **Method**: GET
- **Parameters**: `plot_name` (string)
- **Example**: `http://192.168.41.120:1002/analyze?plot_name=294724`
