import React, { useState, useEffect } from 'react';
import { Download, Edit, Search, Trash2, Save, X, Phone, Mail, MapPin, Building, Loader2, Store } from 'lucide-react';
import { getVendors, patchVendor, deleteVendor } from '../api';

const ITEMS_PER_PAGE = 20;

interface User {
  id: number;
  vendorName?: string;
  vendor_name?: string;
  email: string;
  mobile?: string;
  phone_number?: string;
  gstin?: string;
  state: string;
  city: string;
  address: string;
}

interface VendorListProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

export const VendorList: React.FC<VendorListProps> = ({ users, setUsers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editedUser, setEditedUser] = useState<Partial<User>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch vendors on component mount
  useEffect(() => {
    const fetchVendors = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getVendors();
        const data = response?.data;

        // Handle different response formats
        let vendors: any[] = [];
        if (Array.isArray(data)) {
          vendors = data;
        } else if (Array.isArray(data?.results)) {
          vendors = data.results;
        } else if (Array.isArray(data?.data)) {
          vendors = data.data;
        } else if (data?.vendors && Array.isArray(data.vendors)) {
          vendors = data.vendors;
        }

        // Transform API response to match User interface
        const transformedVendors: User[] = vendors.map((vendor: any, index: number) => {

          const transformed = {
            id: vendor.id,
            vendorName: vendor.vendor_name || vendor.vendorName || vendor.name || '',
            vendor_name: vendor.vendor_name || vendor.vendorName || vendor.name || '',
            email: vendor.email || '',
            mobile: vendor.mobile || vendor.phone_number || vendor.phone || '',
            phone_number: vendor.phone_number || vendor.phone || vendor.mobile || '',
            // Check multiple possible field names for GSTIN - prioritize gstin_number
            gstin: vendor.gstin_number || vendor.gstin || vendor.GSTIN_number || vendor.GSTIN || '',
            state: vendor.state || '',
            city: vendor.city || '',
            address: vendor.address || '',
          };

          return transformed;
        });

        setUsers(transformedVendors);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Failed to fetch vendors');
      } finally {
        setLoading(false);
      }
    };

    fetchVendors();
  }, [setUsers]);

  const handleEdit = (id: number) => {
    const user = (users || []).find((u) => u.id === id);
    setEditingId(id);
    setEditedUser(user || {});
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditedUser({});
  };

  const handleSave = async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      // Prepare data for API (convert frontend field names to backend field names)
      const apiData: any = {
        vendor_name: editedUser.vendorName || editedUser.vendor_name,
        email: editedUser.email,
        phone: editedUser.mobile || editedUser.phone_number || '', // API expects 'phone'
        gstin_number: editedUser.gstin || '',
        state: editedUser.state || '',
        city: editedUser.city || '',
        address: editedUser.address || '',
      };

      // Remove undefined fields (but keep empty strings for optional fields)
      Object.keys(apiData).forEach(key => {
        if (apiData[key] === undefined) {
          delete apiData[key];
        }
      });


      await patchVendor(id, apiData);

      // Update local state immediately (optimistic update)
      const updatedUsers = (users || []).map((user) => (user.id === id ? { ...user, ...editedUser } : user));
      setUsers(updatedUsers);

      // Refresh data from API to ensure consistency
      try {
        const refreshResponse = await getVendors();
        const refreshData = refreshResponse?.data;

        let vendors: any[] = [];
        if (Array.isArray(refreshData)) {
          vendors = refreshData;
        } else if (Array.isArray(refreshData?.results)) {
          vendors = refreshData.results;
        } else if (Array.isArray(refreshData?.data)) {
          vendors = refreshData.data;
        } else if (refreshData?.vendors && Array.isArray(refreshData.vendors)) {
          vendors = refreshData.vendors;
        }

        const transformedVendors: User[] = vendors.map((vendor: any) => ({
          id: vendor.id,
          vendorName: vendor.vendor_name || vendor.vendorName || vendor.name || '',
          vendor_name: vendor.vendor_name || vendor.vendorName || vendor.name || '',
          email: vendor.email || '',
          mobile: vendor.mobile || vendor.phone_number || vendor.phone || '',
          phone_number: vendor.phone_number || vendor.phone || vendor.mobile || '',
          // Check multiple possible field names for GSTIN
          gstin: vendor.gstin || vendor.gstin_number || vendor.GSTIN || vendor.GSTIN_number || '',
          state: vendor.state || '',
          city: vendor.city || '',
          address: vendor.address || '',
        }));

        setUsers(transformedVendors);
        } catch (refreshErr) {
      }

      setEditingId(null);
      setEditedUser({});
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) {
      return;
    }

    setDeleting(id);
    setError(null);
    try {
      await deleteVendor(id);
      setUsers((users || []).filter((user) => user.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete vendor');
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = () => {
    const csv = [
      ['Vendor Name', 'Mobile Number', 'Email', 'GSTIN Number', 'State', 'City', 'Address'],
      ...(users || []).map(({ vendorName, mobile, email, gstin, state, city, address }) => [
        vendorName || '', mobile || '', email || '', gstin || '', state || '', city || '', address || '',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vendor-list.csv';
    a.click();
  };

  const filtered = (users || []).filter(
    (user) =>
      (user.vendorName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.mobile || '').includes(searchTerm) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.gstin?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedData = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset to page 1 if current page is greater than total pages (e.g., after filtering)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

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
              <Store className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Vendor List</h1>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded shadow-md p-4 bg-opacity-95">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 space-y-3 sm:space-y-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
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
                placeholder="Search vendors..."
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
            Loading vendors...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-600 bg-red-50 rounded mb-4">
            {error}
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2">Vendor Name</th>
                <th className="px-4 py-2">Mobile</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">GSTIN</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4">No vendors found</td>
                </tr>
              ) : (
                paginatedData.map((user) => (
                  <tr key={user.id} className="border-b">
                    {editingId === user.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedUser.vendorName || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, vendorName: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedUser.mobile || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, mobile: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="email"
                            value={editedUser.email || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedUser.gstin || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, gstin: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedUser.state || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, state: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedUser.city || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, city: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedUser.address || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, address: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 space-x-2">
                          <button
                            onClick={() => handleSave(user.id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                            title="Save"
                          >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-gray-600 hover:text-gray-800"
                            title="Cancel"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{user.vendorName || 'N/A'}</td>
                        <td className="px-4 py-2">{user.mobile || 'N/A'}</td>
                        <td className="px-4 py-2">{user.email || 'N/A'}</td>
                        <td className="px-4 py-2">{(user.gstin && user.gstin.trim() !== '') ? user.gstin : 'N/A'}</td>
                        <td className="px-4 py-2">{user.state || 'N/A'}</td>
                        <td className="px-4 py-2">{user.city || 'N/A'}</td>
                        <td className="px-4 py-2">{user.address || 'N/A'}</td>
                        <td className="px-4 py-2 space-x-2">
                          <button
                            onClick={() => handleEdit(user.id)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={deleting === user.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Delete"
                          >
                            {deleting === user.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
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

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {paginatedData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No vendors found</div>
          ) : (
            paginatedData.map((user) => (
              <div key={user.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                {editingId === user.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                      <input
                        type="text"
                        value={editedUser.vendorName || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, vendorName: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                      <input
                        type="text"
                        value={editedUser.mobile || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, mobile: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={editedUser.email || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                      <input
                        type="text"
                        value={editedUser.gstin || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, gstin: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        value={editedUser.state || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, state: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        value={editedUser.city || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, city: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={editedUser.address || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, address: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        onClick={() => handleSave(user.id)}
                        disabled={saving}
                        className="text-green-600 hover:text-green-800 px-3 py-1 rounded border disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="text-gray-600 hover:text-gray-800 px-3 py-1 rounded border"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-gray-900 text-sm flex-1 pr-2">{user.vendorName || 'N/A'}</h3>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <Phone className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{user.mobile || 'N/A'}</span>
                      </div>
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{user.email || 'N/A'}</span>
                      </div>
                      <div className="flex items-center">
                        <Building className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{(user.gstin && user.gstin.trim() !== '') ? user.gstin : 'N/A'}</span>
                      </div>
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{user.city || 'N/A'}, {user.state || 'N/A'}</span>
                      </div>
                      {user.address && (
                        <div className="flex items-start">
                          <MapPin className="w-4 h-4 mr-2 text-gray-400 mt-0.5" />
                          <span className="flex-1">{user.address}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleEdit(user.id)}
                        className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded border"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={deleting === user.id}
                        className="text-red-600 hover:text-red-800 px-3 py-1 rounded border disabled:opacity-50"
                      >
                        {deleting === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 space-y-3 sm:space-y-0">
          <button
            onClick={() => {
              if (currentPage > 1) {
                setCurrentPage(currentPage - 1);
              }
            }}
            disabled={currentPage <= 1}
            className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Previous
          </button>
          <div>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages} | Showing {paginatedData.length} of {filtered.length} items
            </span>
          </div>
          <button
            onClick={() => {
              if (currentPage < totalPages) {
                setCurrentPage(currentPage + 1);
              }
            }}
            disabled={currentPage >= totalPages || totalPages === 0}
            className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Next
          </button>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorList;
