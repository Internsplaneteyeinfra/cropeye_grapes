import React, { useState } from 'react';
import { Boxes } from 'lucide-react';
import { addStock } from '../api';

interface InventoryItem {
  id?: number;
  itemName: string;
  Make: string;
  itemType: 'Logistic' | 'Transport' | 'Equipment' | 'Office Purpose' | 'Storage' | 'Processing';
  yearMake: string;
  estimateCost: string;
  status: 'Not working' | 'Working' | 'underRepair';
  remark: string;
}

interface AddStockProps {
  setStocks: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

export const AddStock: React.FC<AddStockProps> = ({ setStocks }) => {
  const [formData, setFormData] = useState<InventoryItem>({
    itemName: '',
    Make: '',
    itemType: 'Logistic',
    yearMake: '',
    estimateCost: '',
    status: 'Working',
    remark: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Map frontend values to backend-expected values
  const mapItemTypeToBackend = (frontendValue: string): string => {
    const mapping: Record<string, string> = {
      'Logistic': 'logistic',
      'Transport': 'transport',
      'Equipment': 'equipment',
      'Office Purpose': 'office_purpose',
      'Storage': 'storage',
      'Processing': 'processing'
    };
    return mapping[frontendValue] || frontendValue.toLowerCase().replace(/\s+/g, '_');
  };

  const mapStatusToBackend = (frontendValue: string): string => {
    const mapping: Record<string, string> = {
      'Working': 'working',
      'Not working': 'not_working',
      'underRepair': 'under_repair'
    };
    return mapping[frontendValue] || frontendValue.toLowerCase().replace(/\s+/g, '_');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');
    try {
      // Prepare data for API (convert frontend field names and values to backend format)
      const apiData = {
        item_name: formData.itemName,
        item_type: mapItemTypeToBackend(formData.itemType), // Convert to backend format
        make: formData.Make,
        year_of_make: formData.yearMake,
        estimate_cost: formData.estimateCost,
        status: mapStatusToBackend(formData.status), // Convert to backend format
        remark: formData.remark || ''
      };

      const response = await addStock(apiData);

      // Reset form
      setFormData({
        itemName: '',
        Make: '',
        itemType: 'Logistic',
        yearMake: '',
        estimateCost: '',
        status: 'Working',
        remark: ''
      });

      setSuccess('Stock added successfully! The stock list will be updated automatically.');

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {

      let errorMessage = 'Error adding stock. Please try again.';

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
        <div className="container mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4">
              <Boxes className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Add New Stock</h1>
            </div>
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-4 max-w-3xl mx-auto bg-opacity-95">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
              <input
                type="text"
                value={formData.itemName}
                onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Type</label>
              <select
                value={formData.itemType}
                onChange={(e) => setFormData({ ...formData, itemType: e.target.value as InventoryItem['itemType'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500"
                required
              >
                <option value="Logistic">Logistic</option>
                <option value="Transport">Transport</option>
                <option value="Equipment">Equipment</option>
                <option value="Office Purpose">Office Purpose</option>
                <option value="Storage">Storage</option>
                <option value="Processing">Processing</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
              <input
                type="text"
                value={formData.Make}
                onChange={(e) => setFormData({ ...formData, Make: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year of Make</label>
              <input
                type="text"
                value={formData.yearMake}
                onChange={(e) => setFormData({ ...formData, yearMake: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimate Cost</label>
              <input
                type="text"
                value={formData.estimateCost}
                onChange={(e) => setFormData({ ...formData, estimateCost: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as InventoryItem['status'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500"
                required
              >
                <option value="Working">Working</option>
                <option value="Not working">Not working</option>
                <option value="underRepair">Under Repair</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
            <textarea
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 h-24"
            />
          </div>

          <div className="flex justify-end mt-6">
            <button
              type="submit"
              className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add Stock'}
            </button>
          </div>
          {success && <div className="text-green-600 mt-2">{success}</div>}
          {error && <div className="text-red-600 mt-2">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
};
