// import React, { useState, useEffect } from 'react';
// import { Download, Search, CheckCircle, Clock, User, Calendar } from 'lucide-react';

// const ITEMS_PER_PAGE = 5;

// interface Task {
//   id: number;
//   taskName: string;
//   assignedTo: string;
//   date: string;
//   status: 'Pending' | 'Completed' | 'InProcess';
//   description?: string;
//   assignedTime?: string;
//   fieldOfficer?: string;
//   submittedBy?: string;
//   submittedAt?: string;
// }

// const ViewList: React.FC = () => {
//   const [searchTerm, setSearchTerm] = useState('');
//   const [currentPage, setCurrentPage] = useState(1);
//   const [tasks, setTasks] = useState<Task[]>([]);
//   const [currentFarmer, setCurrentFarmer] = useState('AjayDhale');


//   // Fetch tasks from API for the current farmer with dummy data fallback
//   useEffect(() => {
//     // Dummy data for demonstration
//     const dummyTasks: Task[] = [
//       {
//         id: 1,
//         taskName: 'Crop Inspection',
//         assignedTo: 'AjayDhale',
//         date: '2025-01-28',
//         status: 'Pending',
//         description: 'Inspect crops for pest damage and disease symptoms in the main field area',
//         assignedTime: '09:00',
//         fieldOfficer: 'Officer Smith'
//       },
//       {
//         id: 2,
//         taskName: 'Irrigation Check',
//         assignedTo: 'AjayDhale',
//         date: '2025-01-28',
//         status: 'InProcess',
//         description: 'Check irrigation system functionality and water flow rates',
//         assignedTime: '14:30',
//         fieldOfficer: 'Officer Johnson'
//       },
//       {
//         id: 3,
//         taskName: 'Fertilizer Application',
//         assignedTo: 'AjayDhale',
//         date: '2025-01-29',
//         status: 'Completed',
//         description: 'Apply NPK fertilizer to designated crop areas as per soil analysis',
//         assignedTime: '08:00',
//         fieldOfficer: 'Officer Brown',
//         submittedBy: 'AjayDhale',
//         submittedAt: '2025-01-29T10:30:00Z'
//       },
//       {
//         id: 4,
//         taskName: 'Soil Testing',
//         assignedTo: 'AjayDhale',
//         date: '2025-01-30',
//         status: 'Pending',
//         description: 'Collect soil samples from different field zones for laboratory analysis',
//         assignedTime: '07:00',
//         fieldOfficer: 'Officer Davis'
//       },
//       {
//         id: 5,
//         taskName: 'Weed Control',
//         assignedTo: 'AjayDhale',
//         date: '2025-01-31',
//         status: 'InProcess',
//         description: 'Remove weeds manually and apply herbicide where necessary',
//         assignedTime: '06:30',
//         fieldOfficer: 'Officer Wilson'
//       }
//     ];

//     fetch('http://localhost:5000/farmartasks')
//       .then((res) => res.json())
//       .then((data) => {
//         const mappedTasks = data.map((task: any) => ({
//           id: Number(task.id) || Date.now(),
//           taskName: task.itemName || task.taskName,
//           assignedTo: task.farmerName || 'AjayDhale',
//           date: task.date || task.selectedDate,
//           status: task.status || 'Pending',
//           description: task.description || '',
//           assignedTime: task.assignedTime || '',
//           fieldOfficer: task.fieldOfficer || '',
//           submittedBy: task.submittedBy || '',
//           submittedAt: task.submittedAt || ''
//         }));
//         // Use API data if available, otherwise use dummy data
//         setTasks(mappedTasks.length > 0 ? mappedTasks : dummyTasks);
//       })
//       .catch((err) => {
//         console.error('Failed to fetch farmer tasks, using dummy data:', err);
//         // Use dummy data when API fails
//         setTasks(dummyTasks);
//       });
//   }, []);

//   // Toggle status between InProcess and Completed (skip Pending)
//   const toggleTaskStatus = (taskId: number, currentStatus: 'Pending' | 'Completed' | 'InProcess') => {
//     let newStatus: 'Pending' | 'Completed' | 'InProcess';

//     if (currentStatus === 'Pending' || currentStatus === 'InProcess') {
//       newStatus = 'Completed';
//     } else {
//       newStatus = 'InProcess';
//     }

//     setTasks(prev =>
//       prev.map(task =>
//         task.id === taskId
//           ? { ...task, status: newStatus }
//           : task
//       )
//     );

//     // Update status in API
//     fetch(`http://localhost:5000/farmartasks/${taskId}`, {
//       method: 'PATCH',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ status: newStatus }),
//     }).catch(err => {
//       console.error('Failed to update task status:', err);
//     });
//   };



//   const handleDownload = () => {
//     const csv = [
//       ['Farmer Name', 'Task Name', 'Date', 'Status', 'Submitted By', 'Submitted At'],
//       ...tasks.map(({ assignedTo, taskName, date, status, submittedBy, submittedAt }) => [
//         assignedTo,
//         taskName,
//         date,
//         status,
//         submittedBy || 'Not submitted',
//         submittedAt || 'Not submitted',
//       ]),
//     ]
//       .map((row) => row.join(','))
//       .join('\n');

//     const blob = new Blob([csv], { type: 'text/csv' });
//     const a = document.createElement('a');
//     a.href = URL.createObjectURL(blob);
//     a.download = `${currentFarmer}-task-checklist.csv`;
//     a.click();
//   };

//   const filtered = tasks.filter(
//     (task) =>
//       task.taskName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//       task.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
//       task.date.includes(searchTerm) ||
//       task.status.toLowerCase().includes(searchTerm.toLowerCase())
//   );

//   const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
//   const paginatedData = filtered.slice(
//     (currentPage - 1) * ITEMS_PER_PAGE,
//     currentPage * ITEMS_PER_PAGE
//   );

//   const getStatusIcon = (status: 'Pending' | 'Completed' | 'InProcess') => {
//     switch (status) {
//       case 'Completed':
//         return <CheckCircle className="w-5 h-5 text-green-600" />;
//       case 'InProcess':
//         return <Clock className="w-5 h-5 text-blue-600" />;
//       default:
//         return <Clock className="w-5 h-5 text-yellow-600" />;
//     }
//   };

//   const getStatusColor = (status: 'Pending' | 'Completed' | 'InProcess') => {
//     switch (status) {
//       case 'Completed':
//         return 'bg-green-100 text-green-800 border-green-200';
//       case 'InProcess':
//         return 'bg-blue-100 text-blue-800 border-blue-200';
//       default:
//         return 'bg-yellow-100 text-yellow-800 border-yellow-200';
//     }
//   };



//   return (
//     <div className="p-3 sm:p-6 bg-gray-50 min-h-screen">
//       <div className="bg-white rounded shadow-md p-3 sm:p-4 max-w-7xl mx-auto mt-6">
//         {/* Farmer Header */}
//         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg space-y-3 sm:space-y-0">
//           <div className="flex items-center space-x-3">
//             <User className="w-6 h-6 text-blue-600" />
//             <div>
//               <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{currentFarmer}</h1>
//               <p className="text-sm sm:text-base text-gray-600">Farmer Task Checklist</p>
//             </div>
//           </div>
//           <div className="text-left sm:text-right">
//             <p className="text-sm text-gray-600">Total Tasks: {tasks.length}</p>
//             <p className="text-sm text-gray-600">
//               Completed: {tasks.filter(t => t.status === 'Completed').length}
//             </p>
//           </div>
//         </div>

//         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-3 sm:space-y-0">
//           <h2 className="text-lg sm:text-xl font-bold text-gray-700">Task Checklist</h2>

//           <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
//             <button onClick={handleDownload} className="text-green-600 hover:text-green-800 flex items-center text-sm">
//               <Download className="w-4 h-4 mr-1" />
//             </button>

//             <div className="relative w-full sm:w-auto">
//               <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
//               <input
//                 type="text"
//                 placeholder="Search tasks..."
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//                 className="w-full sm:w-auto pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-sm"
//               />
//             </div>
//           </div>
//         </div>

//         {/* Desktop Table View - Hidden on mobile */}
//         <div className="hidden md:block overflow-x-auto">
//           <table className="w-full text-sm text-left">
//             <thead className="bg-gray-100 text-gray-600">
//               <tr>
//                 <th className="px-4 py-2">Task Name</th>
//                 <th className="px-4 py-2">Description</th>
//                 <th className="px-4 py-2">Date</th>
//                 <th className="px-4 py-2">Assigned</th>
//                 <th className="px-4 py-2">Status</th>
//               </tr>
//             </thead>
//             <tbody>
//               {paginatedData.length === 0 ? (
//                 <tr>
//                   <td colSpan={5} className="text-center py-4">No tasks found</td>
//                 </tr>
//               ) : (
//                 paginatedData.map((task) => (
//                   <tr key={task.id} className="border-b hover:bg-gray-50">
//                     <td className="px-4 py-3 font-medium">{task.taskName}</td>
//                     <td className="px-4 py-3 text-gray-600">{task.description}</td>
//                     <td className="px-4 py-3">
//                       <div className="flex items-center">
//                         <Calendar className="w-4 h-4 mr-1 text-gray-400" />
//                         {task.date}
//                       </div>
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="flex items-center">
//                         <User className="w-4 h-4 mr-1 text-gray-400" />
//                         <span className="text-gray-700">{task.fieldOfficer || 'N/A'}</span>
//                       </div>
//                     </td>
//                     <td className="px-4 py-3">
//                       <button
//                         onClick={() => toggleTaskStatus(task.id, task.status)}
//                         className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(task.status)}`}
//                       >
//                         {getStatusIcon(task.status)}
//                         <span className="ml-1">{task.status}</span>
//                       </button>
//                     </td>
//                   </tr>
//                 ))
//               )}
//             </tbody>
//           </table>
//         </div>

//         {/* Mobile Card View - Visible only on mobile */}
//         <div className="md:hidden space-y-4">
//           {paginatedData.length === 0 ? (
//             <div className="text-center py-8 text-gray-500">No tasks found</div>
//           ) : (
//             paginatedData.map((task) => (
//               <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
//                 <div className="flex justify-between items-start mb-3">
//                   <h3 className="font-medium text-gray-900 text-sm flex-1 pr-2">{task.taskName}</h3>
//                   <button
//                     onClick={() => toggleTaskStatus(task.id, task.status)}
//                     className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(task.status)} flex-shrink-0`}
//                   >
//                     {getStatusIcon(task.status)}
//                     <span className="ml-1">{task.status}</span>
//                   </button>
//                 </div>

//                 {task.description && (
//                   <p className="text-gray-600 text-sm mb-3 line-clamp-2">{task.description}</p>
//                 )}

//                 <div className="space-y-2">
//                   <div className="flex items-center text-sm text-gray-500">
//                     <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
//                     <span>{task.date}</span>
//                   </div>
//                   <div className="flex items-center text-sm text-gray-500">
//                     <User className="w-4 h-4 mr-2 flex-shrink-0" />
//                     <span>Assigned by: {task.fieldOfficer || 'N/A'}</span>
//                   </div>
//                 </div>
//               </div>
//             ))
//           )}
//         </div>

//         <div className="mt-6 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-600 space-y-3 sm:space-y-0">
//           <p className="order-2 sm:order-1">
//             Showing {paginatedData.length} of {filtered.length} entries
//           </p>
//           <div className="flex space-x-2 order-1 sm:order-2">
//             <button
//               disabled={currentPage === 1}
//               onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
//               className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
//             >
//               Previous
//             </button>
//             <span className="px-3 py-2 bg-gray-100 rounded text-sm">
//               {currentPage} of {totalPages}
//             </span>
//             <button
//               disabled={currentPage === totalPages}
//               onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
//               className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
//             >
//               Next
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default ViewList;


import React, { useEffect, useRef, useState } from 'react';
import { Download, Search, CheckCircle, Clock, User, Calendar, RefreshCw } from 'lucide-react';
import { getTasksForUser, updateTaskStatus } from '../api';

const ITEMS_PER_PAGE = 5;

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  created_by: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  due_date: string;
  created_at?: string;
}

interface ViewListProps {
  currentUserId: number;
  currentUserRole: 'manager' | 'fieldofficer' | 'farmer';
  currentUserName?: string;
}

const ViewList: React.FC<ViewListProps> = ({
  currentUserId,
  currentUserRole,
  currentUserName = 'User'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMenuForTaskId, setStatusMenuForTaskId] = useState<number | null>(null);
  const statusMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string>('');

  const normalizeStatus = (status: string): string => {
    const s = String(status || '').toLowerCase().trim();
    if (s === 'inprocess' || s === 'in_process' || s === 'in process') return 'in_progress';
    if (s === 'complete' || s === 'done') return 'completed';
    if (s === 'pending') return 'pending';
    if (s === 'in_progress') return 'in_progress';
    if (s === 'completed') return 'completed';
    return s || 'pending';
  };

  const toBackendStatusCandidates = (normalized: string): string[] => {
    // Backend might accept either `in_progress` (common) or `inprocess` (legacy).
    if (normalized === 'in_progress') return ['in_progress', 'inprocess'];
    if (normalized === 'completed') return ['completed'];
    if (normalized === 'pending') return ['pending'];
    return [normalized];
  };

  useEffect(() => {
    fetchTasks();
  }, [currentUserId]);

  useEffect(() => {
    const onDocDown = (ev: MouseEvent) => {
      if (statusMenuForTaskId === null) return;
      const el = statusMenuWrapRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) {
        setStatusMenuForTaskId(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [statusMenuForTaskId]);

  const fetchTasks = async () => {
    if (!currentUserId) {
      console.error('No currentUserId provided');
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching tasks for user ID:', currentUserId);
      const response = await getTasksForUser(currentUserId);

      const tasksData = response.data.results
        ? response.data.results
        : (Array.isArray(response.data) ? response.data : []);

      // Filter to ensure only tasks assigned to current user
      const filteredTasks = tasksData.filter((task: any) =>
        task.assigned_to && task.assigned_to.id === currentUserId
      );

      console.log('Tasks loaded for view list:', filteredTasks.length);
      setTasks(filteredTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const setTaskStatus = async (taskId: number, currentStatus: string, nextStatus: string) => {
    const newStatus = normalizeStatus(nextStatus);
    if (!['completed', 'in_progress', 'pending'].includes(newStatus)) return;
    setStatusMenuForTaskId(null);
    setStatusUpdateError('');

    // Optimistically update UI
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, status: newStatus } : task))
    );

    try {
      const candidates = toBackendStatusCandidates(newStatus);
      let lastErr: any = null;
      for (const candidate of candidates) {
        try {
          await updateTaskStatus(taskId, candidate);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (lastErr) throw lastErr;
      // Sync with backend (ensures UI matches server canonical values)
      await fetchTasks();
    } catch (error) {
      console.error('Failed to update task status:', error);
      setStatusUpdateError('Failed to update status. Please try again.');
    }
  };

  const handleDownload = () => {
    const csv = [
      ['Task Name', 'Description', 'Priority', 'Status', 'Due Date', 'Assigned By', 'Created At'],
      ...tasks.map(({ title, description, priority, status, due_date, created_by, created_at }) => [
        title,
        description,
        priority,
        status,
        new Date(due_date).toLocaleDateString(),
        created_by ? `${created_by.first_name} ${created_by.last_name}` : 'N/A',
        created_at ? new Date(created_at).toLocaleString() : 'N/A',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentUserName}-tasks.csv`;
    a.click();
  };

  const filtered = tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.priority.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedData = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-600" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (normalizeStatus(status)) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (normalizeStatus(status)) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Pending';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-green-100 text-green-700';
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="p-3 sm:p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded shadow-md p-3 sm:p-4 max-w-7xl mx-auto mt-6">
        {/* User Header */}
        <div className="flex flex-row items-center justify-between mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <User className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{currentUserName}</h1>
              <p className="text-sm sm:text-base text-gray-600">My Task Checklist</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <p className="text-sm text-gray-600">Total Tasks: {tasks.length}</p>
            <p className="text-sm text-gray-600">Completed: {completedCount}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-3 sm:space-y-0">
          <div className="flex items-center gap-3 sm:gap-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-700">Task Checklist</h2>
            <div className="flex items-center gap-3 sm:hidden">
              <button
                onClick={fetchTasks}
                disabled={loading}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleDownload}
                className="text-green-600 hover:text-green-800 flex items-center"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
            <button
              onClick={fetchTasks}
              disabled={loading}
              className="hidden sm:flex text-blue-600 hover:text-blue-800 items-center text-sm"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />

            </button>
            <button
              onClick={handleDownload}
              className="hidden sm:flex text-green-600 hover:text-green-800 items-center text-sm"
            >
              <Download className="w-4 h-4 mr-1" />

            </button>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-auto pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
        </div>

        {statusUpdateError ? (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded text-sm">
            {statusUpdateError}
          </div>
        ) : null}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading tasks...</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>
                    <th className="px-4 py-2">Task Name</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Priority</th>
                    <th className="px-4 py-2">Due Date</th>
                    <th className="px-4 py-2">Assigned By</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">
                        No tasks found
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((task) => (
                      <tr key={task.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{task.title}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                          {task.description}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                            {new Date(task.due_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <User className="w-4 h-4 mr-1 text-gray-400" />
                            <span className="text-gray-700">
                              {task.created_by
                                ? `${task.created_by.first_name} ${task.created_by.last_name}`
                                : 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative inline-block" ref={statusMenuForTaskId === task.id ? statusMenuWrapRef : null}>
                            <button
                              type="button"
                              onClick={() =>
                                setStatusMenuForTaskId((prev) => (prev === task.id ? null : task.id))
                              }
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(task.status)}`}
                              title="Change status"
                            >
                              {getStatusIcon(task.status)}
                              <span className="ml-1">{getStatusLabel(task.status)}</span>
                            </button>

                            {statusMenuForTaskId === task.id ? (
                              <div className="absolute z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => setTaskStatus(task.id, task.status, 'in_progress')}
                                >
                                  In progress
                                </button>
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => setTaskStatus(task.id, task.status, 'completed')}
                                >
                                  Completed
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {paginatedData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No tasks found</div>
              ) : (
                paginatedData.map((task) => (
                  <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-gray-900 text-sm flex-1 pr-2">
                        {task.title}
                      </h3>
                      <div className="relative inline-block flex-shrink-0" ref={statusMenuForTaskId === task.id ? statusMenuWrapRef : null}>
                        <button
                          type="button"
                          onClick={() =>
                            setStatusMenuForTaskId((prev) => (prev === task.id ? null : task.id))
                          }
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(task.status)}`}
                          title="Change status"
                        >
                          {getStatusIcon(task.status)}
                          <span className="ml-1">{getStatusLabel(task.status)}</span>
                        </button>

                        {statusMenuForTaskId === task.id ? (
                          <div className="absolute right-0 z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => setTaskStatus(task.id, task.status, 'in_progress')}
                            >
                              In progress
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => setTaskStatus(task.id, task.status, 'completed')}
                            >
                              Completed
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {task.description && (
                      <p className="text-gray-600 text-sm mb-3">{task.description}</p>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                          {task.priority} priority
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <User className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span>
                          Assigned by: {task.created_by
                            ? `${task.created_by.first_name} ${task.created_by.last_name}`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-600 space-y-3 sm:space-y-0">
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
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ViewList;
