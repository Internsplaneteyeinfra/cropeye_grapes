# Farm Management System

A comprehensive farm management solution designed to support various farm operations including user and task management, equipment and inventory control, bookings, vendor management, farm registration with GIS capabilities, and more. The system is built with Role-Based Access Control (RBAC) to ensure proper authorization.

## Features

- **User Management**: Create, read, update, and delete users with different roles (Super Admin, Owner, Manager, Field Officer, Farmer)
- **Task Management**: Assign and track tasks with comments and attachments
- **Equipment Management**: Track equipment status, usage records, and maintenance history
- **Bookings Management**: Schedule and manage various types of bookings
- **Inventory Management**: Track inventory items with automatic status updates based on quantity levels
- **Vendor & Purchase Orders**: Manage vendors, create purchase orders, and track communications
- **Farm Registration with GIS**: Register farms with geographic information, draw boundaries on interactive maps, manage farm plots, and track sensors

## Requirements

- Python 3.8+
- Django 4.2+
- Django REST Framework
- PostgreSQL/SQLite
- GDAL (for GIS functionality)
- GeoDjango

## Installation

1. Clone the repository:
```bash
git clone https://github.com/planeteyeai/farm-management.git
cd farm-management
```

2. Set up a virtual environment:
```bash
python -m venv venv
# On Windows
venv\Scripts\activate
# On macOS/Linux
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. For GIS functionality, you'll need to install GDAL:
   - On Windows, the easiest way is to use OSGeo4W installer: https://trac.osgeo.org/osgeo4w/
   - On macOS: `brew install gdal`
   - On Linux: `sudo apt-get install gdal-bin libgdal-dev`

5. Apply migrations:
```bash
python manage.py migrate
```

6. Create a superuser:
```bash
python manage.py createsuperuser
```

7. Run the development server:
```bash
python manage.py runserver
```

## API Endpoints

### Authentication
- `POST /api/token/`: Get JWT token using username and password
- `POST /api/token/refresh/`: Refresh JWT token
- `POST /api/otp/`: Request OTP
- `POST /api/verify-otp/`: Verify OTP

### User Management
- `GET /api/users/`: List users
- `POST /api/users/`: Create user
- `GET /api/users/{id}/`: Retrieve user
- `PUT /api/users/{id}/`: Update user
- `DELETE /api/users/{id}/`: Delete user
- `GET /api/users/me/`: Get current user

### Task Management
- `GET /api/tasks/`: List tasks
- `POST /api/tasks/`: Create task
- `GET /api/tasks/{id}/`: Retrieve task
- `PUT /api/tasks/{id}/`: Update task
- `DELETE /api/tasks/{id}/`: Delete task
- `POST /api/tasks/{id}/comments/`: Add comment to task
- `POST /api/tasks/{id}/attachments/`: Add attachment to task

### Equipment Management
- `GET /api/equipment/`: List equipment
- `POST /api/equipment/`: Create equipment
- `GET /api/equipment/{id}/`: Retrieve equipment
- `PUT /api/equipment/{id}/`: Update equipment
- `DELETE /api/equipment/{id}/`: Delete equipment
- `GET /api/equipment/{id}/maintenance-records/`: List maintenance records
- `GET /api/equipment/{id}/usage-records/`: List usage records

### Bookings Management
- `GET /api/bookings/`: List bookings
- `POST /api/bookings/`: Create booking
- `GET /api/bookings/{id}/`: Retrieve booking
- `PUT /api/bookings/{id}/`: Update booking
- `DELETE /api/bookings/{id}/`: Delete booking

### Inventory Management
- `GET /api/inventory/`: List inventory items
- `POST /api/inventory/`: Create inventory item
- `GET /api/inventory/{id}/`: Retrieve inventory item
- `PUT /api/inventory/{id}/`: Update inventory item
- `DELETE /api/inventory/{id}/`: Delete inventory item
- `GET /api/inventory/low-stock/`: List low stock items
- `GET /api/inventory/expiring-soon/`: List items expiring soon
- `POST /api/inventory/{id}/add-transaction/`: Add transaction to inventory item
- `GET /api/transactions/`: List inventory transactions

### Vendor & Purchase Orders
- `GET /api/vendors/`: List vendors
- `POST /api/vendors/`: Create vendor
- `GET /api/vendors/{id}/`: Retrieve vendor details with purchase orders
- `PUT /api/vendors/{id}/`: Update vendor
- `DELETE /api/vendors/{id}/`: Delete vendor
- `GET /api/purchase-orders/`: List purchase orders
- `POST /api/purchase-orders/`: Create purchase order
- `GET /api/purchase-orders/{id}/`: Retrieve purchase order details
- `PUT /api/purchase-orders/{id}/`: Update purchase order
- `DELETE /api/purchase-orders/{id}/`: Delete purchase order
- `POST /api/purchase-orders/{id}/add-item/`: Add item to purchase order
- `POST /api/purchase-orders/{id}/approve/`: Approve purchase order
- `POST /api/purchase-orders/{id}/receive/`: Mark purchase order as received
- `POST /api/purchase-orders/{id}/cancel/`: Cancel purchase order

### Farm GIS Management
- `GET /api/farms/`: List farms
- `POST /api/farms/`: Create farm with geographic data
- `GET /api/farms/{id}/`: Retrieve farm details
- `PUT /api/farms/{id}/`: Update farm
- `DELETE /api/farms/{id}/`: Delete farm
- `GET /api/farms/geojson/`: Get farms as GeoJSON for map display
- `GET /api/farm-plots/`: List farm plots
- `POST /api/farm-plots/`: Create farm plot with boundary
- `GET /api/farm-plots/geojson/`: Get farm plots as GeoJSON
- `GET /api/soil-types/`: List soil types
- `GET /api/crop-types/`: List crop types

## GIS Features

The Farm Management System includes comprehensive GIS capabilities:

- Interactive maps for farm registration and management
- Draw and edit farm boundaries using polygon tools
- Place markers for farm locations and sensors
- Search for locations by name
- View all farms on a map with their boundaries
- Manage farm plots with geographic boundaries
- Track sensor locations within the farm

## API Documentation

API documentation is available at:
- Swagger UI: `/swagger/`
- ReDoc: `/redoc/`

## License

This project is licensed under the MIT License.
