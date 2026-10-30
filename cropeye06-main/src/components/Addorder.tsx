import React, { useState, useEffect } from 'react';
import { ClipboardList, Trash2 } from 'lucide-react';
import { addOrder, getVendors } from '../api';

interface Item {
  id: string;
  itemName: string;
  yearOfMake: string;
  estimateCost: string;
  remark: string;
}

interface Vendor {
  id: number;
  vendor_name: string;
  email?: string;
  mobile?: string;
  phone?: string;
}

interface AddOrderProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
}

export const Addorder: React.FC<AddOrderProps> = ({ items, setItems }) => {
  const [selectedVendor, setSelectedVendor] = React.useState('');
  const [invoiceDate, setInvoiceDate] = React.useState('');
  const [invoiceNumber, setInvoiceNumber] = React.useState('');
  const [selectedState, setSelectedState] = React.useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ];

  // Fetch vendors on component mount using getVendors API
  useEffect(() => {
    const fetchVendors = async () => {
      setLoadingVendors(true);
      setError(''); // Clear previous errors
      try {
        // Call GET /api/vendors/ endpoint
        const response = await getVendors();
        const data = response?.data;

        // Handle different response formats from API
        let vendorsList: any[] = [];
        if (Array.isArray(data)) {
          // Direct array response: [{id, vendor_name, ...}, ...]
          vendorsList = data;
        } else if (Array.isArray(data?.results)) {
          // Paginated response: {results: [...], count: ...}
          vendorsList = data.results;
        } else if (Array.isArray(data?.data)) {
          // Nested data: {data: [...]}
          vendorsList = data.data;
        } else if (data?.vendors && Array.isArray(data.vendors)) {
          // Wrapped in vendors key: {vendors: [...]}
          vendorsList = data.vendors;
        }

        // Transform API response to Vendor interface
        const transformedVendors: Vendor[] = vendorsList.map((vendor: any) => ({
          id: vendor.id || vendor.vendor_id,
          vendor_name: vendor.vendor_name || vendor.name || vendor.vendorName || 'Unknown Vendor',
          email: vendor.email || '',
          mobile: vendor.mobile || vendor.phone || vendor.phone_number || '',
        }));

        setVendors(transformedVendors);

        // Log for debugging
        if (transformedVendors.length === 0) {
          console.warn('No vendors found in API response:', data);
        } else {
          console.log(`Loaded ${transformedVendors.length} vendor(s) from API`);
        }
      } catch (err: any) {
        console.error('Error fetching vendors:', err);
        const errorMessage = err?.response?.data?.detail ||
                           err?.response?.data?.message ||
                           err?.message ||
                           'Failed to load vendors. Please refresh the page.';
        setError(errorMessage);
        setVendors([]); // Clear vendors on error
      } finally {
        setLoadingVendors(false);
      }
    };

    fetchVendors();
  }, []);

  const addNewRow = () => {
    setItems([...items, {
      id: String(Date.now()),
      itemName: '',
      yearOfMake: '',
      estimateCost: '',
      remark: ''
    }]);
  };

  const deleteRow = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof Item, value: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that at least one item is filled
    const validItems = items.filter(item => item.itemName.trim() !== '');
    if (validItems.length === 0) {
      setError('Please add at least one item to the order.');
      return;
    }

    setLoading(true);
    setSuccess('');
    setError('');

    try {
      // Validate vendor selection
      if (!selectedVendor) {
        setError('Please select a vendor.');
        setLoading(false);
        return;
      }

      const vendorId = parseInt(selectedVendor, 10);
      if (isNaN(vendorId)) {
        setError('Invalid vendor selected. Please select a vendor again.');
        setLoading(false);
        return;
      }

      // Prepare data for API (convert frontend field names to backend field names)
      const apiData = {
        vendor: vendorId, // Use vendor ID, not name
        invoice_date: invoiceDate,
        invoice_number: invoiceNumber,
        state: selectedState,
        items: validItems.map((item) => ({
          item_name: item.itemName,
          year_of_make: item.yearOfMake,
          estimate_cost: item.estimateCost,
          remark: item.remark || ''
        }))
      };

      const response = await addOrder(apiData);

      setSuccess('Order(s) submitted successfully! The order list will be updated automatically.');

      // Reset form fields and items
      setSelectedVendor('');
      setInvoiceDate('');
      setInvoiceNumber('');
      setSelectedState('');
      setItems([
        {
          id: String(Date.now()),
          itemName: '',
          yearOfMake: '',
          estimateCost: '',
          remark: ''
        }
      ]);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {

      let errorMessage = 'Failed to submit order. Please try again.';

      if (err?.response?.status === 404) {
        errorMessage = 'API endpoint not found (404). Please check the server configuration.';
      } else if (err?.response?.status === 400) {
        const errorData = err?.response?.data;
        if (errorData) {
          // Extract field-specific errors
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
      } else {
        errorMessage = err?.message || errorMessage;
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
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4">
              <ClipboardList className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Accounting</h1>
            </div>
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-6 bg-opacity-95">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Inputs */}
            <div>
              <label className="text-sm font-medium">Vendor Name *</label>
              <select
                className="w-full rounded-md border p-2"
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                required
                disabled={loadingVendors}
              >
                <option value="">
                  {loadingVendors ? 'Loading vendors...' : 'Select Vendor'}
                </option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id.toString()}>
                    {vendor.vendor_name}
                    {vendor.email ? ` - ${vendor.email}` : ''}
                    {vendor.mobile ? ` (${vendor.mobile})` : ''}
                  </option>
                ))}
              </select>
              {vendors.length === 0 && !loadingVendors && (
                <p className="text-xs text-gray-500 mt-1">No vendors available. Please add a vendor first.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Invoice Date *</label>
              <input type="date" className="w-full rounded-md border p-2" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">Invoice Number *</label>
              <input type="text" className="w-full rounded-md border p-2" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">State *</label>
              <select className="w-full rounded-md border p-2" value={selectedState} onChange={(e) => setSelectedState(e.target.value)} required>
                <option value="">Select State</option>
                {indianStates.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Item Table */}
          <h2 className="text-lg font-semibold mb-4">Manage Items</h2>
          <table className="w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Item Name</th>
                <th className="p-2 text-left">YearOfMake</th>
                <th className="p-2 text-left">EstimateCost</th>
                <th className="p-2 text-left">Remark</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="p-2">
                    <input type="text" className="w-full border rounded p-1" value={item.itemName} onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)} required />
                  </td>
                  <td className="p-2">
                    <input type="text" className="w-full border rounded p-1" value={item.yearOfMake} onChange={(e) => handleItemChange(item.id, 'yearOfMake', e.target.value)} required />
                  </td>
                  <td className="p-2">
                    <input type="text" className="w-full border rounded p-1" value={item.estimateCost} onChange={(e) => handleItemChange(item.id, 'estimateCost', e.target.value)} required />
                  </td>
                  <td className="p-2">
                    <input type="text" className="w-full border rounded p-1" value={item.remark} onChange={(e) => handleItemChange(item.id, 'remark', e.target.value)} />
                  </td>
                  <td className="p-2 text-center">
                    {items.length > 1 && (
                      <button type="button" onClick={() => deleteRow(item.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addNewRow} className="mt-3 text-blue-600 hover:text-blue-800">+ Add Row</button>

          {/* Buttons */}
          <div className="flex justify-end gap-4 mt-6">
            <button
              type="submit"
              disabled={loading}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Add Order'}
            </button>
          </div>

          {success && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}
          </form>
        </div>
      </div>
    </div>
  );
};
