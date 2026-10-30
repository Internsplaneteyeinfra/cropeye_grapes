import React, { useState } from 'react';
import { CalendarCheck2, Loader2 } from 'lucide-react';
import { addBooking } from '../api';

interface AddBookingProps {
  bookings: any[];
  setBookings: React.Dispatch<React.SetStateAction<any[]>>;
}

const AddBooking: React.FC<AddBookingProps> = ({ bookings, setBookings }) => {
  const [formData, setFormData] = useState({
    itemName: '',
    userRole: '',
    startDate: '',
    endDate: '',
    status: 'available',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validate required fields
    if (!formData.itemName || !formData.userRole || !formData.startDate || !formData.endDate || !formData.status) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    // Validate dates
    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      setError('End date must be after start date.');
      setLoading(false);
      return;
    }

    try {
      // Map frontend field names to backend field names (values are already in backend format)
      const apiData = {
        item_name: formData.itemName.trim(),
        user_role: formData.userRole.trim(),
        start_date: formData.startDate,
        end_date: formData.endDate,
        status: formData.status.trim(),
      };

      console.log('Sending booking data:', apiData);
      const response = await addBooking(apiData);
      console.log('Booking response:', response);

      // Update local state with the new booking
      const newBooking = {
        id: response.data.id || Date.now(),
        itemName: response.data.item_name || formData.itemName,
        item_name: response.data.item_name || formData.itemName,
        userRole: response.data.user_role || formData.userRole,
        user_role: response.data.user_role || formData.userRole,
        startDate: response.data.start_date || formData.startDate,
        start_date: response.data.start_date || formData.startDate,
        endDate: response.data.end_date || formData.endDate,
        end_date: response.data.end_date || formData.endDate,
        status: response.data.status || formData.status,
      };

      setBookings([...bookings, newBooking]);
      setSuccess(true);
      setFormData({
        itemName: '',
        userRole: '',
        startDate: '',
        endDate: '',
        status: 'available',
      });

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('AddBooking Error:', {
        message: err?.message,
        status: err?.response?.status,
        statusText: err?.response?.statusText,
        data: err?.response?.data,
        url: err?.config?.url,
        baseURL: err?.config?.baseURL,
        fullURL: err?.config?.baseURL + err?.config?.url,
        requestData: err?.config?.data,
      });

      let errorMessage = 'Failed to add booking. Please try again.';
      const status = err?.response?.status;

      if (status === 404) {
        const fullUrl = err?.config?.baseURL + err?.config?.url;
        errorMessage = `API endpoint not found (404). URL: ${fullUrl}. Please check if the bookings endpoint exists on the server.`;
      } else if (status === 500) {
        // Server error - show detailed error message from backend if available
        const errorData = err?.response?.data;
        console.error('Server error (500) details:', {
          errorData,
          requestData: err?.config?.data,
          url: err?.config?.url,
          fullURL: err?.config?.baseURL + err?.config?.url
        });

        if (errorData) {
          const errorDetail = errorData.detail || errorData.message || errorData.error;
          if (errorDetail) {
            errorMessage = `Server Error (500): ${errorDetail}. Please check with the backend team or try again later.`;
          } else {
            errorMessage = `Server Error (500): ${JSON.stringify(errorData)}. Please check the backend logs.`;
          }
        } else {
          errorMessage = 'Server Error (500): Internal server error. The backend encountered an unexpected error. Please try again later or contact support.';
        }
      } else if (status === 400) {
        const errorData = err?.response?.data;
        if (errorData) {
          const fieldErrors = Object.entries(errorData)
            .filter(([key]) => key !== 'detail' && key !== 'message')
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('; ');

          errorMessage = errorData.detail || errorData.message || fieldErrors || 'Invalid data format. Please check all fields.';
        } else {
          errorMessage = 'Invalid request format (400). Please check all required fields are filled.';
        }
      } else if (err?.response?.data) {
        errorMessage = err.response.data.detail || err.response.data.message || err.message || errorMessage;
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen dashboard-bg-bleed"
    >
      <div className="min-h-screen bg-black bg-opacity-40">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4">
              <CalendarCheck2 className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Add Booking</h1>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-lg p-8 bg-opacity-95">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              <div>
                <label htmlFor="itemName" className="block text-base font-medium text-gray-700 mb-2">
                  Item Name
                </label>
                <input
                  type="text"
                  id="itemName"
                  name="itemName"
                  value={formData.itemName}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 text-base rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                />
              </div>

              <div>
                <label htmlFor="userRole" className="block text-base font-medium text-gray-700 mb-2">
                  User Role
                </label>
                <select
                  id="userRole"
                  name="userRole"
                  value={formData.userRole}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 text-base rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                >
                  <option value="">Select Role</option>
                  <option value="owner">owner</option>
                  <option value="manager">manager</option>
                  <option value="field_officer">field_officer</option>
                  <option value="vendor">vendor</option>
                  <option value="farmer">farmer</option>
                </select>
              </div>

              <div>
                <label htmlFor="startDate" className="block text-base font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 text-base rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-base font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 text-base rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                />
              </div>

              <div>
                <label htmlFor="status" className="block text-base font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 text-base rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                >
                  <option value="available">available</option>
                  <option value="book">book</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                <p className="font-medium">Error: {error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                <p className="font-medium">Booking added successfully!</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 text-base font-medium text-white bg-green-500 border border-transparent rounded-lg shadow-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>{loading ? 'Adding...' : 'Add Booking'}</span>
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddBooking;
