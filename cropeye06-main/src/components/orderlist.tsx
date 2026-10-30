import React, { useState, useEffect } from 'react';
import { Download, Edit, Search, Trash2, Check, X, Loader2, ClipboardList } from 'lucide-react';
import { debounce } from 'lodash';
import { getorders, patchOrder, deleteOrder } from '../api';

const ITEMS_PER_PAGE = 5;

interface User {
  id: number;
  vendor_name?: string;
  invoice_date?: string;
invoice_number?: string;
  state: string;
  item_name?: string;
  year_of_make?: string;
  estimate_cost?: string;
  remark: string;
}

interface OrderListProps {
  items: User[];
  setItems: React.Dispatch<React.SetStateAction<User[]>>;
}

export const OrderList: React.FC<OrderListProps> = ({ items, setItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<User>>({});
  const [originalOrderData, setOriginalOrderData] = useState<any>(null); // Store original order structure
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch orders on component mount
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getorders();
        const data = response?.data;

        // Handle different response formats
        let orders: any[] = [];
        if (Array.isArray(data)) {
          orders = data;
        } else if (Array.isArray(data?.results)) {
          orders = data.results;
        } else if (Array.isArray(data?.data)) {
          orders = data.data;
        } else if (data?.orders && Array.isArray(data.orders)) {
          orders = data.orders;
        }

        // Transform API response to match User interface
        // Handle items array if present
        const transformedOrders: User[] = orders.map((order: any) => {
          const items = order?.items || [];
          const firstItem = items[0] || {};

          // Handle vendor - can be ID (number) or object with vendor_name
          let vendor_name = '';
          if (typeof order.vendor === 'object' && order.vendor !== null) {
            vendor_name = order.vendor.vendor_name || order.vendor.name || '';
          } else if (order.vendor_name) {
            vendor_name = order.vendor_name;
          } else if (order.vendor_name) {
            vendor_name = order.vendor_name;
          } else if (order.vendor) {
            // If vendor is just an ID, we'll show it as "Vendor #ID"
            vendor_name = `Vendor #${order.vendor}`;
          }

          return {
            id: order.id,
            vendor_name: vendor_name,
           invoice_date: order.invoice_date || order.invoiceDate || '',
            invoice_number: order.invoice_number || order.invoice_number || '',
            state: order.state || '',
            item_name: firstItem.item_name || order.item_name || order.item_name || '',
            year_of_make: firstItem.year_of_make || order.year_of_make || order.year_of_make || '',
           estimate_cost: firstItem.estimate_cost || order.estimate_cost || order.estimateCost || '',
            remark: firstItem.remark || order.remark || '',
          };
        });

        setItems(transformedOrders);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [setItems]);

  const handleEditClick = (user: User) => {
    setEditId(user.id);
    setEditFormData({ ...user });
  };

  const handleCancelClick = () => {
    setEditId(null);
    setEditFormData({});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveClick = async () => {
    if (editId === null) return;

    setSaving(true);
    setError(null);
    try {
      // Prepare data for API (convert frontend field names to backend field names)
      // Note: For PATCH, we only send the fields that are being updated
      const apiData: any = {};

      // Include all editable fields from editFormData (PATCH allows partial updates)
      // Only include fields that have values (not empty, null, or undefined)
      if (editFormData.invoice_date !== undefined && editFormData.invoice_date !== null && editFormData.invoice_date !== '') {
        apiData.invoice_date = editFormData.invoice_date;
      }

      if (editFormData.invoice_number !== undefined && editFormData.invoice_number !== null && editFormData.invoice_number !== '') {
        apiData.invoice_number = editFormData.invoice_number;
      }

      if (editFormData.state !== undefined && editFormData.state !== null && editFormData.state !== '') {
        apiData.state = editFormData.state;
      }

      if (editFormData.item_name !== undefined && editFormData.item_name !== null && editFormData.item_name !== '') {
        apiData.item_name = editFormData.item_name;
      }

      if (editFormData.year_of_make !== undefined && editFormData.year_of_make !== null && editFormData.year_of_make !== '') {
        apiData.year_of_make = editFormData.year_of_make;
      }

      if (editFormData.estimate_cost !== undefined && editFormData.estimate_cost !== null && editFormData.estimate_cost !== '') {
        apiData.estimate_cost = editFormData.estimate_cost;
      }

      if (editFormData.remark !== undefined && editFormData.remark !== null && editFormData.remark !== '') {
        apiData.remark = editFormData.remark;
      }

      // Validate that at least one field is being updated
      if (Object.keys(apiData).length === 0) {
        setError('Please modify at least one field before saving.');
        setSaving(false);
        return;
      }

      console.log('Patching order with data:', {
        id: editId,
        data: apiData
      });

      const response = await patchOrder(editId, apiData);
      console.log('Order patch response:', response);

      // Refresh data from API to ensure consistency
      const fetchOrders = async () => {
        try {
          const response = await getorders();
          const data = response?.data;

          let orders: any[] = [];
          if (Array.isArray(data)) {
            orders = data;
          } else if (Array.isArray(data?.results)) {
            orders = data.results;
          } else if (Array.isArray(data?.data)) {
            orders = data.data;
          } else if (data?.orders && Array.isArray(data.orders)) {
            orders = data.orders;
          }

          const transformedOrders: User[] = orders.map((order: any) => {
            const items = order?.items || [];
            const firstItem = items[0] || {};

            let vendor_name = '';
            if (typeof order.vendor === 'object' && order.vendor !== null) {
              vendor_name = order.vendor.vendor_name || order.vendor.name || '';
            } else if (order.vendor_name) {
              vendor_name = order.vendor_name;
            } else if (order.vendor_name) {
              vendor_name = order.vendor_name;
            } else if (order.vendor) {
              vendor_name = `Vendor #${order.vendor}`;
            }

            return {
              id: order.id,
              vendor_name: vendor_name,
             invoice_date: order.invoice_date || order.invoiceDate || '',
              invoice_number: order.invoice_number || order.invoice_number || '',
              state: order.state || '',
              item_name: firstItem.item_name || order.item_name || order.item_name || '',
              year_of_make: firstItem.year_of_make || order.year_of_make || order.year_of_make || '',
             estimate_cost: firstItem.estimate_cost || order.estimate_cost || order.estimateCost || '',
              remark: firstItem.remark || order.remark || '',
            };
          });

          setItems(transformedOrders);
        } catch (fetchErr) {
        }
      };

      await fetchOrders();

      setEditId(null);
      setEditFormData({});
    } catch (err: any) {

      let errorMessage = 'Failed to update order. Please try again.';

      if (err?.response?.status === 400) {
        const errorData = err?.response?.data;
        if (errorData) {
          // Extract field-specific errors
          const fieldErrors = Object.entries(errorData)
            .filter(([key]) => key !== 'detail' && key !== 'message')
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('; ');

          errorMessage = errorData.detail || errorData.message || fieldErrors || 'Invalid data format. Please check all fields.';
        } else {
          errorMessage = 'Invalid request format (400). Please check all required fields are filled correctly.';
        }
      } else if (err?.response?.data) {
        errorMessage = err.response.data.detail || err.response.data.message || err.message || errorMessage;
      } else {
        errorMessage = err?.message || errorMessage;
      }

      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this order?')) {
      return;
    }

    setDeleting(id);
    setError(null);
    try {
      await deleteOrder(id);
      setItems(items.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete order');
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = () => {
    const header = ['vendor_name', 'invoice_number', 'invoice_date', 'estimate_cost', 'year_of_make', 'state', 'item_name', 'remark'];
    const csvRows = [
      header.join(','),
      ...items.map(({ vendor_name, invoice_number,invoice_date,estimate_cost, year_of_make, state, item_name, remark }) =>
        [vendor_name, invoice_number,invoice_date,estimate_cost, year_of_make, state, item_name, remark].map(val =>
          `"${(val || '').replace(/"/g, '""')}"`
        ).join(',')
      ),
    ];
    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'order-list.csv';
    a.click();
  };

  // Debounced search
  const debouncedSearch = debounce((term: string) => setSearchTerm(term), 500);

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debouncedSearch(e.target.value);
    setCurrentPage(1); // Reset to first page on new search
  };

  const filtered = items.filter((item) =>
    (item.invoice_date && item.invoice_date.includes(searchTerm)) ||
    (item.vendor_name && item.vendor_name.includes(searchTerm)) ||
    (item.invoice_number && item.invoice_number.includes(searchTerm))
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedData = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div
      className="min-h-screen dashboard-bg-bleed"
    >
      <div className="min-h-screen bg-black bg-opacity-40">
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4">
              <ClipboardList className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Order List</h1>
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
                placeholder="Search orders..."
                onChange={handleSearchChange}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center text-gray-600 flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading orders...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-600 bg-red-50 rounded mb-4">
            {error}
          </div>
        )}

        {/* Desktop Table View - Hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2">VendorName</th>
                <th className="px-4 py-2">Itemname</th>
                <th className="px-4 py-2">InvoiceDate</th>
                <th className="px-4 py-2">InvoiceNumber</th>
                <th className="px-4 py-2">Estimatecost</th>
                <th className="px-4 py-2">Yearofmake</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Remark</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-4">No order found</td>
                </tr>
              ) : (
                paginatedData.map((user) => (
                  <tr key={user.id} className="border-b">
                    {editId === user.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="vendor_name"
                            value={editFormData.vendor_name || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="item_name"
                            value={editFormData.item_name || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            name="invoice_date"
                            value={editFormData.invoice_date || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="invoice_number"
                            value={editFormData.invoice_number || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="estimate_cost"
                            value={editFormData.estimate_cost || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="year_of_make"
                            value={editFormData.year_of_make || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="state"
                            value={editFormData.state || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="remark"
                            value={editFormData.remark || ''}
                            onChange={handleInputChange}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-4 py-2 space-x-2">
                          <button
                            onClick={handleSaveClick}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                            title="Save"
                          >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={handleCancelClick}
                            className="text-gray-600 hover:text-gray-800"
                            title="Cancel"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{user.vendor_name}</td>
                        <td className="px-4 py-2">{user.item_name}</td>
                        <td className="px-4 py-2">{user.invoice_date}</td>
                        <td className="px-4 py-2">{user.invoice_number}</td>
                        <td className="px-4 py-2">{user.estimate_cost}</td>
                        <td className="px-4 py-2">{user.year_of_make}</td>
                        <td className="px-4 py-2">{user.state}</td>
                        <td className="px-4 py-2">{user.remark}</td>
                        <td className="px-4 py-2 space-x-2">
                          <button onClick={() => handleEditClick(user)} className="text-blue-600 hover:text-blue-800" title="Edit">
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

        {/* Mobile Card View - Visible only on mobile */}
        <div className="md:hidden space-y-4">
          {paginatedData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No orders found</div>
          ) : (
            paginatedData.map((user) => (
              <div key={user.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                {editId === user.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                      <input
                        type="text"
                        name="vendor_name"
                        value={editFormData.vendor_name || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                      <input
                        type="text"
                        name="item_name"
                        value={editFormData.item_name || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                      <input
                        type="date"
                        name="invoice_date"
                        value={editFormData.invoice_date || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                      <input
                        type="text"
                        name="invoice_number"
                        value={editFormData.invoice_number || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estimate Cost</label>
                      <input
                        type="text"
                        name="estimate_cost"
                        value={editFormData.estimate_cost || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Year of Make</label>
                      <input
                        type="text"
                        name="year_of_make"
                        value={editFormData.year_of_make || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        name="state"
                        value={editFormData.state || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                      <input
                        type="text"
                        name="remark"
                        value={editFormData.remark || ''}
                        onChange={handleInputChange}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        onClick={handleSaveClick}
                        disabled={saving}
                        className="text-green-600 hover:text-green-800 px-3 py-1 rounded border disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={handleCancelClick}
                        className="text-gray-600 hover:text-gray-800 px-3 py-1 rounded border"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-gray-900 text-sm flex-1 pr-2">{user.vendor_name}</h3>
                      <span className="text-xs text-gray-500">{user.invoice_date}</span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <span className="font-medium w-20">Item:</span>
                        <span>{user.item_name}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium w-20">Invoice:</span>
                        <span>{user.invoice_number}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium w-20">Cost:</span>
                        <span>{user.estimate_cost}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium w-20">Year:</span>
                        <span>{user.year_of_make}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium w-20">State:</span>
                        <span>{user.state}</span>
                      </div>
                      {user.remark && (
                        <div className="flex items-start">
                          <span className="font-medium w-20">Remark:</span>
                          <span className="flex-1">{user.remark}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => handleEditClick(user)} className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded border">
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

        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 space-y-3 sm:space-y-0">
          <button
            onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm order-1 sm:order-none"
          >
            Previous
          </button>

          <div className="order-2 sm:order-none">
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages} | Showing {paginatedData.length} of {filtered.length} items
            </span>
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm order-3 sm:order-none"
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
