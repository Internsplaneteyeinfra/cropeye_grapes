
import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { addUser } from '../api';
import { useNavigate } from 'react-router-dom';
import { gatewayLogout } from '../utils/gatewayAuth';

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  role: string;
  username: string;
  address: string;
}

interface AddusersProps {
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  users: User[];
}

export const Addusers: React.FC<AddusersProps> = ({ setUsers, users }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    password2: '',
    email: '',
    first_name: '',
    last_name: '',
    role: 'admin',
    phone_number: '',
    address: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password !== formData.password2) {
      setError('Passwords do not match.');
      return;
    }

    // Map form role values to backend role_id integers
    // Keep "admin" in form state for UI, but send role_id: 4 to backend
    const roleIdMap: { [key: string]: number } = {
      'admin': 4,        // Owner -> role_id: 4
      'fieldofficer': 2, // Field Officer -> role_id: 2
    };

    const userData = {
      username: formData.username,
      password: formData.password,
      password2: formData.password2,
      email: formData.email,
      first_name: formData.first_name,
      last_name: formData.last_name,
      role_id: roleIdMap[formData.role] || 2, // Send role_id as integer to backend
      phone_number: formData.phone_number,
      address: formData.address,
    };

    try {
      await addUser(userData);

      // For display, convert role to readable role name
      const displayRoleMap: { [key: string]: string } = {
        'admin': 'Factory Head Office',        // Display as "Factory Head Office" in UI
        'fieldofficer': 'Field Officer', // Display as "Field Officer" in UI
      };

      const newUser: User = {
        id: users.length + 1, // Ideally should come from backend response
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone_number: formData.phone_number,
        role: displayRoleMap[formData.role] || formData.role, // Display "Factory Head Office" instead of "admin"
        username: formData.username,
        address: formData.address,
      };

      setUsers([...users, newUser]);
      setSuccess('User added successfully!');
      setFormData({
        username: '',
        password: '',
        password2: '',
        email: '',
        first_name: '',
        last_name: '',
        role: 'admin', // Keep 'admin' in form state for UI
        phone_number: '',
        address: '',
      });

      // Redirect based on role
      if (formData.role === 'admin') {
        navigate('/OwnerHomeGrid');
      } else if (formData.role === 'fieldofficer') {
        navigate('/FieldOfficerHomeGrid');
      }

    } catch (error: any) {
      if (error.response?.data) {
        const apiErrors = error.response.data;
        const status = error.response.status;

        // Handle token validation errors specifically
        if (status === 401 || apiErrors.code === 'token_not_valid') {
          setError('Your session has expired. Please login again to continue.');
          // Redirect to login after 3 seconds
          setTimeout(() => {
            gatewayLogout();
          }, 3000);
          return;
        }

        const errorMessages = Object.entries(apiErrors)
          .map(([key, val]) => {
            // Handle nested error objects
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
              return `${key}: ${JSON.stringify(val)}`;
            }
            return `${key}: ${Array.isArray(val) ? val.join(', ') : val}`;
          })
          .join('\n');
        setError(errorMessages || 'Failed to add user');
      } else if (error.request) {
        setError('No response from server. Please check your internet connection.');
      } else {
        setError(error.message || 'An error occurred while adding the user.');
      }
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: `url('/icons/sugarcane main slide.jpg')`
      }}
    >
      <div className="min-h-screen bg-black bg-opacity-40">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4">
              <UserPlus className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Add New User</h1>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-lg p-8 bg-opacity-95">
          <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[
            ['username', 'Username'],
            ['password', 'Password'],
            ['password2', 'Confirm Password'],
            ['email', 'Email'],
            ['first_name', 'First Name'],
            ['last_name', 'Last Name'],
            ['phone_number', 'Phone Number'],
            ['address', 'Address'],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700">{label}</label>
              <input
                type={field.includes('password') ? 'password' : field === 'email' ? 'email' : 'text'}
                value={(formData as any)[field]}
                onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
                required
              />
            </div>
          ))}

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
              required
            >
              <option value="admin">Factory Head Office</option>
              <option value="fieldofficer">Field Officer</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            className="bg-gray-400 text-white py-2 px-4 rounded-md hover:bg-gray-500"
            onClick={() =>
              setFormData({
                username: '',
                password: '',
                password2: '',
                email: '',
                first_name: '',
                last_name: '',
                role: 'admin',
                phone_number: '',
                address: '',
              })
            }
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600"
          >
            Add User
          </button>
        </div>

            {error && <div className="text-red-500 mt-4 whitespace-pre-line">{error}</div>}
            {success && <div className="text-green-500 mt-4">{success}</div>}
          </form>
          </div>
        </div>
      </div>
    </div>
  );
};
