import React, { useState, useEffect } from 'react';
import { Download, Edit, Search, Trash2, Save, X, Loader2, Boxes } from 'lucide-react';
import { getstock, patchStock, deleteStock } from '../api';

const ITEMS_PER_PAGE = 5;

interface Stock {
  id: number;
  itemName?: string;
  item_name?: string;
  itemType?: string;
  item_type?: string;
  make: string;
  yearOfMake?: string;
  year_of_make?: string;
  estimateCost?: string;
  estimate_cost?: string;
  status: string;
  remark: string;
}

interface StockListProps {
  stocks: Stock[];
  setStocks: React.Dispatch<React.SetStateAction<Stock[]>>;
}

export const StockList: React.FC<StockListProps> = ({ stocks, setStocks }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editedStock, setEditedStock] = useState<Partial<Stock>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch stock function
  const fetchStock = async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      let data;

      response = await getstock();
      data = response?.data;

      // Handle different response formats
      let stockItems: any[] = [];
      if (Array.isArray(data)) {
        stockItems = data;
      } else if (Array.isArray(data?.results)) {
        stockItems = data.results;
      } else if (Array.isArray(data?.data)) {
        stockItems = data.data;
      } else if (data?.stock && Array.isArray(data.stock)) {
        stockItems = data.stock;
      } else if (data?.stocks && Array.isArray(data.stocks)) {
        stockItems = data.stocks;
      }

      // Transform API response to match Stock interface
      const transformedStocks: Stock[] = stockItems.map((stock: any) => {
        const transformed = {
          id: stock.id,
          itemName: stock.item_name || stock.itemName || '',
          itemType: stock.item_type || stock.itemType || '',
          make: stock.make || '',
          yearOfMake: stock.year_of_make || stock.yearOfMake || '',
          estimateCost: stock.estimate_cost || stock.estimateCost || '',
          status: stock.status || '',
          remark: stock.remark || '',
        };
        return transformed;
      });

      setStocks(transformedStocks);
    } catch (err: any) {
      console.error('❌ Failed to fetch stock:', err);
      console.error('❌ Error details:', {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
      });
      setError(err?.response?.data?.message || err?.response?.data?.detail || err?.message || 'Failed to fetch stock');
    } finally {
      setLoading(false);
    }
  };

  // Fetch stock on component mount
  useEffect(() => {
    fetchStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = (id: number) => {
    console.log('✏️ Edit clicked for stock ID:', id);
    console.log('✏️ Current stocks:', stocks);
    const stock = (stocks || []).find((s) => s.id === id);
    console.log('✏️ Found stock:', stock);
    if (!stock) {
      console.error('❌ Stock not found with ID:', id);
      setError(`Stock item with ID ${id} not found`);
      return;
    }
    setEditingId(id);
    // Preserve both frontend and backend field names for editing
    setEditedStock({
      ...stock,
      // Ensure we have both frontend and backend field names
      itemName: stock.itemName || stock.item_name || '',
      item_name: stock.item_name || stock.itemName || '',
      itemType: stock.itemType || stock.item_type || '',
      item_type: stock.item_type || stock.itemType || '',
      yearOfMake: stock.yearOfMake || stock.year_of_make || '',
      year_of_make: stock.year_of_make || stock.yearOfMake || '',
      estimateCost: stock.estimateCost || stock.estimate_cost || '',
      estimate_cost: stock.estimate_cost || stock.estimateCost || '',
    });
    console.log('✏️ Set editing stock:', stock);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditedStock({});
  };

  const handleSave = async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      console.log('💾 Saving stock ID:', id);
      console.log('💾 Edited stock data:', editedStock);

      // Prepare data for API (convert frontend field names to backend field names)
      const apiData: any = {};

      // Only include fields that have actual values (not empty strings, undefined, or null)
      if (editedStock.itemName !== undefined && editedStock.itemName !== null && editedStock.itemName !== '') {
        apiData.item_name = editedStock.itemName;
      } else if (editedStock.item_name !== undefined && editedStock.item_name !== null && editedStock.item_name !== '') {
        apiData.item_name = editedStock.item_name;
      }

      if (editedStock.itemType !== undefined && editedStock.itemType !== null && editedStock.itemType !== '') {
        apiData.item_type = editedStock.itemType;
      } else if (editedStock.item_type !== undefined && editedStock.item_type !== null && editedStock.item_type !== '') {
        apiData.item_type = editedStock.item_type;
      }

      if (editedStock.make !== undefined && editedStock.make !== null && editedStock.make !== '') {
        apiData.make = editedStock.make;
      }

      if (editedStock.yearOfMake !== undefined && editedStock.yearOfMake !== null && editedStock.yearOfMake !== '') {
        apiData.year_of_make = editedStock.yearOfMake;
      } else if (editedStock.year_of_make !== undefined && editedStock.year_of_make !== null && editedStock.year_of_make !== '') {
        apiData.year_of_make = editedStock.year_of_make;
      }

      if (editedStock.estimateCost !== undefined && editedStock.estimateCost !== null && editedStock.estimateCost !== '') {
        apiData.estimate_cost = editedStock.estimateCost;
      } else if (editedStock.estimate_cost !== undefined && editedStock.estimate_cost !== null && editedStock.estimate_cost !== '') {
        apiData.estimate_cost = editedStock.estimate_cost;
      }

      if (editedStock.status !== undefined && editedStock.status !== null && editedStock.status !== '') {
        apiData.status = editedStock.status;
      }

      if (editedStock.remark !== undefined && editedStock.remark !== null && editedStock.remark !== '') {
        apiData.remark = editedStock.remark;
      }

      // Validate that at least one field is being updated
      if (Object.keys(apiData).length === 0) {
        setError('Please make at least one change before saving.');
        setSaving(false);
        return;
      }

      console.log('💾 API payload:', apiData);
      console.log('💾 Sending PATCH request to:', `/stock/${id}/`);

      const response = await patchStock(id, apiData);
      console.log('✅ Stock updated successfully:', response.data);

      // Refresh data from API to ensure consistency
      await fetchStock();

      // Update local state as fallback
      setStocks((stocks || []).map((stock) => (stock.id === id ? { ...stock, ...editedStock } : stock)));
      setEditingId(null);
      setEditedStock({});
    } catch (err: any) {
      console.error('❌ Failed to update stock:', err);
      console.error('❌ Error response:', err?.response);
      console.error('❌ Error data:', err?.response?.data);
      console.error('❌ Error status:', err?.response?.status);

      // Extract detailed error message
      let errorMessage = 'Failed to update stock';
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
    if (!window.confirm('Are you sure you want to delete this stock item?')) {
      return;
    }

    setDeleting(id);
    setError(null);
    try {
      await deleteStock(id);

      // Refresh data from API to ensure consistency
      await fetchStock();

      // Update local state as fallback
      setStocks((stocks || []).filter((stock) => stock.id !== id));
    } catch (err: any) {
      console.error('Failed to delete stock:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to delete stock');
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = () => {
    const csv = [
      ['Item Name', 'Item Type', 'Make', 'Year Of Make', 'Estimated Cost', 'Status', 'Remark'],
      ...stocks.map(({ itemName, itemType, make, yearOfMake, estimateCost, status, remark }) => [
        itemName, itemType, make, yearOfMake, estimateCost, status, remark
      ])
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stock-list.csv';
    a.click();
  };

  const filtered = (stocks || []).filter(
    (stock) =>
      (stock.itemName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (stock.itemType?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (stock.status?.toLowerCase() || '').includes(searchTerm.toLowerCase())
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
              <Boxes className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Stock List</h1>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded shadow-md p-4 bg-opacity-95">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 space-y-3 sm:space-y-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* <button
              onClick={fetchStock}
              disabled={loading}
              className="text-blue-600 hover:text-blue-800 flex items-center justify-center py-2 px-4 border border-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
              title="Refresh"
            > */}
              {/* {loading ? <Loader2 className="w-5 h-5 mr-1 animate-spin" /> : <Search className="w-5 h-5 mr-1" />}
              <span className="hidden sm:inline">Refresh</span> */}
            {/* </button> */}
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
                placeholder="Search stock items..."
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
            Loading stock items...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-600 bg-red-50 rounded mb-4">
            <p className="font-medium">Error: {error}</p>
            <button
              onClick={() => {
                setError(null);
                window.location.reload();
              }}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Reload page
            </button>
          </div>
        )}

        {!loading && !error && (stocks || []).length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No stock items found.</p>
            <p className="text-sm mt-2">Check the browser console for API response details.</p>
          </div>
        )}

        {/* Desktop Table View - Hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2">Item Name</th>
                <th className="px-4 py-2">Item Type</th>
                <th className="px-4 py-2">Make</th>
                <th className="px-4 py-2">Year Of Make</th>
                <th className="px-4 py-2">Estimated Cost</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Remark</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4">No stock items found</td>
                </tr>
              ) : (
                paginatedData.map((stock) => (
                  <tr key={stock.id} className="border-b">
                    {editingId === stock.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.itemName || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, itemName: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.itemType || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, itemType: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.make || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, make: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.yearOfMake || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, yearOfMake: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.estimateCost || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, estimateCost: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.status || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, status: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editedStock.remark || ''}
                            onChange={(e) => setEditedStock({ ...editedStock, remark: e.target.value })}
                            className="border rounded px-2 py-1 w-full text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 space-x-2">
                          <button
                            onClick={() => handleSave(stock.id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                            title="Save"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-gray-600 hover:text-gray-800"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{stock.itemName || 'N/A'}</td>
                        <td className="px-4 py-2">{stock.itemType || 'N/A'}</td>
                        <td className="px-4 py-2">{stock.make || 'N/A'}</td>
                        <td className="px-4 py-2">{stock.yearOfMake || 'N/A'}</td>
                        <td className="px-4 py-2">{stock.estimateCost || 'N/A'}</td>
                        <td className="px-4 py-2">{stock.status || 'N/A'}</td>
                        <td className="px-4 py-2">{stock.remark || 'N/A'}</td>
                        <td className="px-4 py-2 space-x-3">
                          <button
                            onClick={() => handleEdit(stock.id)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(stock.id)}
                            disabled={deleting === stock.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Delete"
                          >
                            {deleting === stock.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
            <div className="text-center py-8 text-gray-500">No stock items found</div>
          ) : (
            paginatedData.map((stock) => (
              <div key={stock.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-medium text-gray-900 text-sm flex-1 pr-2">{stock.itemName}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    stock.status === 'Available' ? 'bg-green-100 text-green-800' :
                    stock.status === 'In Use' ? 'bg-blue-100 text-blue-800' :
                    stock.status === 'Maintenance' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {stock.status}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <span className="font-medium w-20">Type:</span>
                    <span>{stock.itemType}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium w-20">Make:</span>
                    <span>{stock.make}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium w-20">Year:</span>
                    <span>{stock.yearOfMake}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium w-20">Cost:</span>
                    <span>{stock.estimateCost}</span>
                  </div>
                  {stock.remark && (
                    <div className="flex items-start">
                      <span className="font-medium w-20">Remark:</span>
                      <span className="flex-1">{stock.remark}</span>
                    </div>
                  )}
                </div>

                {editingId === stock.id ? (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                      <input
                        type="text"
                        value={editedStock.itemName || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, itemName: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Type</label>
                      <input
                        type="text"
                        value={editedStock.itemType || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, itemType: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
                      <input
                        type="text"
                        value={editedStock.make || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, make: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Year of Make</label>
                      <input
                        type="text"
                        value={editedStock.yearOfMake || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, yearOfMake: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estimate Cost</label>
                      <input
                        type="text"
                        value={editedStock.estimateCost || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, estimateCost: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <input
                        type="text"
                        value={editedStock.status || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, status: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                      <input
                        type="text"
                        value={editedStock.remark || ''}
                        onChange={(e) => setEditedStock({ ...editedStock, remark: e.target.value })}
                        className="border px-3 py-2 rounded w-full text-sm"
                      />
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        onClick={() => handleSave(stock.id)}
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
                  <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleEdit(stock.id)}
                      className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded border"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(stock.id)}
                      disabled={deleting === stock.id}
                      className="text-red-600 hover:text-red-800 px-3 py-1 rounded border disabled:opacity-50"
                    >
                      {deleting === stock.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-600 space-y-3 sm:space-y-0">
          <p className="order-2 sm:order-1">
            Showing {paginatedData.length} of {filtered.length} entries
          </p>
          <div className="flex space-x-2 order-1 sm:order-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-2 bg-gray-100 rounded text-sm">
              {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
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
