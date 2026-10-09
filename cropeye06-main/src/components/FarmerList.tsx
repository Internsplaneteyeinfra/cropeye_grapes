import React, { useState, useEffect } from 'react';
import { Download, Search, CheckCircle, Clock, Eye } from 'lucide-react';
import { getTasks, updateTaskStatus } from '../api';

const ITEMS_PER_PAGE = 5;

interface FarmerTask {
  id: number;
  farmerName: string;
  assignedTask: string;
  date: string;
  status: 'Pending' | 'Completed';
  description?: string;
  fieldOfficer?: string;
}

export const FarmerList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [tasks, setTasks] = useState<FarmerTask[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<string | null>(null);
  const [showFarmerTasks, setShowFarmerTasks] = useState(false);

  // Fetch all farmer tasks from API
  useEffect(() => {
    getTasks()
      .then(({ data }) => {
        const records = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        setTasks(records.map((task: any) => ({
          id: Number(task.id),
          farmerName:
            task.assigned_to?.first_name ||
            task.assigned_to?.username ||
            task.farmer?.first_name ||
            task.farmer?.username ||
            'Unknown',
          assignedTask: task.title || task.task_name || 'Task',
          date: task.due_date || '',
          status: String(task.status).toLowerCase() === 'completed'
            ? 'Completed'
            : 'Pending',
          description: task.description || '',
          fieldOfficer:
            task.assigned_to?.username ||
            task.assigned_to_username ||
            'Current Officer'
        })));
      })
      .catch((err) => {
        console.error('Failed to fetch Railway tasks:', err);
        setTasks([]);
      });
  }, []);

  const handleStatusChange = async (taskId: number, newStatus: 'Pending' | 'Completed') => {
    const previousTasks = tasks;
    setTasks(prev => 
      prev.map(task => 
        task.id === taskId 
          ? { ...task, status: newStatus }
          : task
      )
    );

    try {
      await updateTaskStatus(taskId, newStatus.toLowerCase());
    } catch (err) {
      console.error('Failed to update Railway task status:', err);
      setTasks(previousTasks);
    }
  };

  const handleViewFarmerTasks = (farmerName: string) => {
    setSelectedFarmer(farmerName);
    setShowFarmerTasks(true);
  };

  const handleDownload = () => {
    const csv = [
      ['Farmer Name', 'Assigned Task', 'Date', 'Status', 'Field Officer'],
      ...tasks.map(({ farmerName, assignedTask, date, status, fieldOfficer }) => [
        farmerName,
        assignedTask,
        date,
        status,
        fieldOfficer,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'farmer-task-list.csv';
    a.click();
  };

  const filtered = tasks.filter(
    (task) =>
      task.farmerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.assignedTask.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.date.includes(searchTerm) ||
      task.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedData = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getStatusIcon = (status: 'Pending' | 'Completed') => {
    return status === 'Completed' ? (
      <CheckCircle className="w-5 h-5 text-green-600" />
    ) : (
      <Clock className="w-5 h-5 text-yellow-600" />
    );
  };

  const getStatusColor = (status: 'Pending' | 'Completed') => {
    return status === 'Completed' 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : 'bg-yellow-100 text-yellow-800 border-yellow-200';
  };

  const selectedFarmerTasks = tasks.filter(task => task.farmerName === selectedFarmer);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded shadow-md p-4 max-w-7xl mx-auto mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-700">Farmer Task Management</h2>

          <div className="flex items-center space-x-4">
            <button onClick={handleDownload} className="text-green-600 hover:text-green-800 flex items-center">
              <Download className="w-5 h-5 mr-1" /> Download
            </button>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search farmers or tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {!showFarmerTasks ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>
                    <th className="px-4 py-2">Farmer Name</th>
                    <th className="px-4 py-2">Assigned Task</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4">No tasks found</td>
                    </tr>
                  ) : (
                    paginatedData.map((task) => (
                      <tr key={task.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{task.farmerName}</td>
                        <td className="px-4 py-3">{task.assignedTask}</td>
                        <td className="px-4 py-3">{task.date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}>
                            {getStatusIcon(task.status)}
                            <span className="ml-1">{task.status}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleViewFarmerTasks(task.farmerName)}
                              className="text-blue-600 hover:text-blue-800 flex items-center"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View Tasks
                            </button>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={task.status === 'Completed'}
                                onChange={(e) => handleStatusChange(task.id, e.target.checked ? 'Completed' : 'Pending')}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-600">
                                {task.status === 'Completed' ? 'Completed' : 'Mark Complete'}
                              </span>
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between items-center text-sm text-gray-600">
              <p>
                Showing {paginatedData.length} of {filtered.length} entries
              </p>
              <div className="space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Tasks for {selectedFarmer}
              </h3>
              <button
                onClick={() => setShowFarmerTasks(false)}
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back to Farmer List
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>
                    <th className="px-4 py-2">Task Name</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFarmerTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4">No tasks found for {selectedFarmer}</td>
                    </tr>
                  ) : (
                    selectedFarmerTasks.map((task) => (
                      <tr key={task.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{task.assignedTask}</td>
                        <td className="px-4 py-3 text-gray-600">{task.description}</td>
                        <td className="px-4 py-3">{task.date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}>
                            {getStatusIcon(task.status)}
                            <span className="ml-1">{task.status}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.status === 'Completed'}
                              onChange={(e) => handleStatusChange(task.id, e.target.checked ? 'Completed' : 'Pending')}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-600">
                              {task.status === 'Completed' ? 'Completed' : 'Mark Complete'}
                            </span>
                          </label>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 