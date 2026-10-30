import React, { useState, useEffect } from 'react';
import { Download, Edit, Save, Search, Trash2, Loader2, X, CalendarCheck2 } from 'lucide-react';
import { getbookings, patchBooking, deleteBooking } from '../api';

const ITEMS_PER_PAGE = 5;

interface Booking {
  id: number;
  itemName?: string;
  item_name?: string;
  userRole?: string;
  user_role?: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  status: string;
}

interface BookingListProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
}

export const BookingList: React.FC<BookingListProps> = ({ bookings, setBookings }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editedBooking, setEditedBooking] = useState<Partial<Booking>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch bookings on component mount
  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getbookings();
      const data = response?.data;

      // Handle different response formats
      let bookingItems: any[] = [];
      if (Array.isArray(data)) {
        bookingItems = data;
      } else if (Array.isArray(data?.results)) {
        bookingItems = data.results;
      } else if (Array.isArray(data?.data)) {
        bookingItems = data.data;
      } else if (data?.bookings && Array.isArray(data.bookings)) {
        bookingItems = data.bookings;
      }

      // Transform API response to match Booking interface
      const transformedBookings: Booking[] = bookingItems.map((booking: any) => ({
        id: booking.id,
        itemName: booking.item_name || booking.itemName || '',
        item_name: booking.item_name || booking.itemName || '',
        userRole: booking.user_role || booking.userRole || '',
        user_role: booking.user_role || booking.userRole || '',
        startDate: booking.start_date || booking.startDate || '',
        start_date: booking.start_date || booking.startDate || '',
        endDate: booking.end_date || booking.endDate || '',
        end_date: booking.end_date || booking.endDate || '',
        status: booking.status || '',
      }));
      setBookings(transformedBookings);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to fetch bookings');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (id: number) => {
    const booking = bookings.find((b) => b.id === id);
    if (booking) {
      setEditingId(id);
      // Preserve both frontend and backend field names
      setEditedBooking({
        ...booking,
        itemName: booking.itemName || booking.item_name || '',
        item_name: booking.item_name || booking.itemName || '',
        userRole: booking.userRole || booking.user_role || '',
        user_role: booking.user_role || booking.userRole || '',
        startDate: booking.startDate || booking.start_date || '',
        start_date: booking.start_date || booking.startDate || '',
        endDate: booking.endDate || booking.end_date || '',
        end_date: booking.end_date || booking.endDate || '',
      });
    } else {
      setError(`Booking with ID ${id} not found`);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditedBooking({});
  };

  const handleSave = async (id: number) => {
    setSaving(true);
    setError(null);
    try {

      // Prepare data for API (convert frontend field names to backend field names)
      const apiData: any = {};

      // Only include fields that have actual values (not empty strings, undefined, or null)
      if (editedBooking.itemName !== undefined && editedBooking.itemName !== null && editedBooking.itemName !== '') {
        apiData.item_name = editedBooking.itemName;
      } else if (editedBooking.item_name !== undefined && editedBooking.item_name !== null && editedBooking.item_name !== '') {
        apiData.item_name = editedBooking.item_name;
      }

      if (editedBooking.userRole !== undefined && editedBooking.userRole !== null && editedBooking.userRole !== '') {
        apiData.user_role = editedBooking.userRole;
      } else if (editedBooking.user_role !== undefined && editedBooking.user_role !== null && editedBooking.user_role !== '') {
        apiData.user_role = editedBooking.user_role;
      }

      if (editedBooking.startDate !== undefined && editedBooking.startDate !== null && editedBooking.startDate !== '') {
        apiData.start_date = editedBooking.startDate;
      } else if (editedBooking.start_date !== undefined && editedBooking.start_date !== null && editedBooking.start_date !== '') {
        apiData.start_date = editedBooking.start_date;
      }

      if (editedBooking.endDate !== undefined && editedBooking.endDate !== null && editedBooking.endDate !== '') {
        apiData.end_date = editedBooking.endDate;
      } else if (editedBooking.end_date !== undefined && editedBooking.end_date !== null && editedBooking.end_date !== '') {
        apiData.end_date = editedBooking.end_date;
      }

      if (editedBooking.status !== undefined && editedBooking.status !== null && editedBooking.status !== '') {
        // Ensure status is lowercase to match backend format
        apiData.status = editedBooking.status.toLowerCase();
      }

      // Validate that at least one field is being updated
      if (Object.keys(apiData).length === 0) {
        setError('Please make at least one change before saving.');
        setSaving(false);
        return;
      }


      const response = await patchBooking(id, apiData);

      // Refresh data from API to ensure consistency
      await fetchBookings();

      // Update local state as fallback
      setBookings((bookings || []).map((booking) => (booking.id === id ? { ...booking, ...editedBooking } : booking)));
      setEditingId(null);
      setEditedBooking({});
    } catch (err: any) {

      // Extract detailed error message
      let errorMessage = 'Failed to update booking';
      if (err?.response?.data) {
        const errorData = err.response.data;
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else {
          // Handle field-specific validation errors
          const fieldErrors = Object.entries(errorData)
            .map(([field, messages]: [string, any]) => {
              const msg = Array.isArray(messages) ? messages.join(', ') : messages;
              return `${field}: ${msg}`;
            })
            .join('; ');
          if (fieldErrors) {
            errorMessage = `Validation errors: ${fieldErrors}`;
          }
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this booking?')) {
      return;
    }

    setDeleting(id);
    setError(null);
    try {
      await deleteBooking(id);

      // Refresh data from API to ensure consistency
      await fetchBookings();

      // Update local state as fallback
      setBookings((bookings || []).filter((booking) => booking.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete booking');
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = () => {
    const csv = [
      ['Item Name', 'User Role', 'Start Date', 'End Date', 'Status'],
      ...(bookings || []).map((booking) => [
        booking.itemName || booking.item_name || '',
        booking.userRole || booking.user_role || '',
        booking.startDate || booking.start_date || '',
        booking.endDate || booking.end_date || '',
        booking.status || '',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'booking-list.csv';
    a.click();
  };

  const filtered = (bookings || []).filter(
    (b) =>
      (b.itemName?.toLowerCase() || b.item_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (b.userRole?.toLowerCase() || b.user_role?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (b.status?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedData = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: `url('/icons/sugarcane main slide.jpg')`
      }}
    >
      <div className="min-h-screen bg-black bg-opacity-40">
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4">
              <CalendarCheck2 className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Booking List</h1>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded shadow-md p-4 bg-opacity-95">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 space-y-3 sm:space-y-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={fetchBookings}
              disabled={loading}
              // className="text-blue-600 hover:text-blue-800 flex items-center justify-center py-2 px-4 border border-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
              title="Refresh"
            >
              {/* {loading ? <Loader2 className="w-5 h-5 mr-1 animate-spin" /> : <Search className="w-5 h-5 mr-1" />} */}
              {/* <span className="hidden sm:inline">Refresh</span> */}
            </button>
            <button
              onClick={handleDownload}
              className="text-green-600 hover:text-green-800 flex items-center justify-center py-2 px-4 border border-green-600 rounded hover:bg-green-50"
            >
              <Download className="w-5 h-5 mr-1" />
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search bookings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-600 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading bookings...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-600 bg-red-50 rounded mb-4">
            <p className="font-medium">Error: {error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchBookings();
              }}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (bookings || []).length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No bookings found.</p>
            <p className="text-sm mt-2">Check the browser console for API response details.</p>
          </div>
        )}

        {/* Desktop Table View - Hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2">Item Name</th>
                <th className="px-4 py-2">User Role</th>
                <th className="px-4 py-2">Start Date</th>
                <th className="px-4 py-2">End Date</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-4">No bookings found</td>
                </tr>
              ) : (
                paginatedData.map((booking) => (
                  <tr key={booking.id} className="border-b">
                    {editingId === booking.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedBooking?.itemName || editedBooking?.item_name || ''}
                            onChange={(e) => setEditedBooking({ ...editedBooking, itemName: e.target.value, item_name: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                            disabled={saving}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedBooking?.userRole || editedBooking?.user_role || ''}
                            onChange={(e) => setEditedBooking({ ...editedBooking, userRole: e.target.value, user_role: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                            disabled={saving}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={editedBooking?.startDate || editedBooking?.start_date || ''}
                            onChange={(e) => setEditedBooking({ ...editedBooking, startDate: e.target.value, start_date: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                            disabled={saving}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={editedBooking?.endDate || editedBooking?.end_date || ''}
                            onChange={(e) => setEditedBooking({ ...editedBooking, endDate: e.target.value, end_date: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                            disabled={saving}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editedBooking?.status || ''}
                            onChange={(e) => setEditedBooking({ ...editedBooking, status: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                            disabled={saving}
                          >
                            <option value="available">available</option>
                            <option value="book">book</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 space-x-3">
                          <button
                            onClick={() => handleSave(booking.id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                            title="Save"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={saving}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{booking.itemName || booking.item_name || 'N/A'}</td>
                        <td className="px-4 py-2">{booking.userRole || booking.user_role || 'N/A'}</td>
                        <td className="px-4 py-2">{booking.startDate || booking.start_date || 'N/A'}</td>
                        <td className="px-4 py-2">{booking.endDate || booking.end_date || 'N/A'}</td>
                        <td className="px-4 py-2">{booking.status || 'N/A'}</td>
                        <td className="px-4 py-2 space-x-3">
                          <button onClick={() => handleEdit(booking.id)} className="text-blue-600 hover:text-blue-800" title="Edit">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(booking.id)}
                            disabled={deleting === booking.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Delete"
                          >
                            {deleting === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View - Visible only on mobile */}
        <div className="md:hidden space-y-4">
          {paginatedData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No bookings found</div>
          ) : (
            paginatedData.map((booking) => (
              <div key={booking.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                {editingId === booking.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                      <input
                        type="text"
                        value={editedBooking?.itemName || editedBooking?.item_name || ''}
                        onChange={(e) => setEditedBooking({ ...editedBooking, itemName: e.target.value, item_name: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">User Role</label>
                      <input
                        type="text"
                        value={editedBooking?.userRole || editedBooking?.user_role || ''}
                        onChange={(e) => setEditedBooking({ ...editedBooking, userRole: e.target.value, user_role: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={editedBooking?.startDate || editedBooking?.start_date || ''}
                        onChange={(e) => setEditedBooking({ ...editedBooking, startDate: e.target.value, start_date: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={editedBooking?.endDate || editedBooking?.end_date || ''}
                        onChange={(e) => setEditedBooking({ ...editedBooking, endDate: e.target.value, end_date: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={editedBooking?.status || ''}
                        onChange={(e) => setEditedBooking({ ...editedBooking, status: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                        disabled={saving}
                      >
                        <option value="Available">Available</option>
                        <option value="Book">Book</option>
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        onClick={() => handleSave(booking.id)}
                        disabled={saving}
                        className="text-green-600 hover:text-green-800 px-3 py-1 rounded border disabled:opacity-50 flex items-center space-x-1"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>Save</span>
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={saving}
                        className="text-red-600 hover:text-red-800 px-3 py-1 rounded border disabled:opacity-50 flex items-center space-x-1"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-gray-900 text-sm flex-1 pr-2">{booking.itemName || booking.item_name || 'N/A'}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        booking.status === 'book' || booking.status === 'Book' ? 'bg-green-100 text-green-800' :
                        booking.status === 'available' || booking.status === 'Available' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.status || 'N/A'}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <span className="font-medium w-20">User:</span>
                        <span>{booking.userRole || booking.user_role || 'N/A'}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium w-20">Start:</span>
                        <span>{booking.startDate || booking.start_date || 'N/A'}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium w-20">End:</span>
                        <span>{booking.endDate || booking.end_date || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => handleEdit(booking.id)} className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded border" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(booking.id)}
                        disabled={deleting === booking.id}
                        className="text-red-600 hover:text-red-800 px-3 py-1 rounded border disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-600 space-y-3 sm:space-y-0">
          <p className="order-2 sm:order-1">
            Showing {paginatedData.length} of {filtered.length} entries
          </p>
          <div className="flex space-x-2 order-1 sm:order-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-2 bg-gray-100 rounded text-sm">
              {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
            >
              Next
            </button>
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
};
