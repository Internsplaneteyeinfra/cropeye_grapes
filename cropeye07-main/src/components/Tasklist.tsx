// import React, { useEffect, useState } from 'react';
// import { Download, Edit, Search, Trash2, List, Calendar, RefreshCw } from 'lucide-react';
// import { getTasksForUser } from '../api';

// const ITEMS_PER_PAGE = 5;

// interface ListTask {
//   id: number;
//   title: string;
//   description: string;
//   status: string;
//   priority: string;
//   assigned_to: {
//     id: number;
//     username: string;
//     first_name: string;
//     last_name: string;
//   };
//   created_by: {
//     id: number;
//     username: string;
//     first_name: string;
//     last_name: string;
//   };
//   due_date: string;
//   created_at?: string;
// }

// interface TasklistProps {
//   currentUserId: number;
//   currentUserRole: 'manager' | 'fieldofficer' | 'farmer';
//   currentUserName?: string;
// }

// export const Tasklist: React.FC<TasklistProps> = ({
//   currentUserId ,
//   currentUserRole,
//   currentUserName = 'User'
// }) => {
//   const [searchTerm, setSearchTerm] = useState('');
//   const [currentPage, setCurrentPage] = useState(1);
//   const [tasks, setTasks] = useState<ListTask[]>([]);
//   const [loading, setLoading] = useState(false);

//   const fetchTasks = async () => {
//     if (!currentUserId) {
//       console.error('No currentUserId provided');
//       return;
//     }

//     setLoading(true);
//     try {
//       console.log('Fetching tasks for user ID:', currentUserId);
//       const response = await getTasksForUser(currentUserId);

//       const tasksData = response.data.results
//         ? response.data.results
//         : (Array.isArray(response.data) ? response.data : []);

//       const filteredTasks = tasksData.filter((task: any) =>
//         task.assigned_to && task.assigned_to.id === currentUserId
//       );

//       console.log(`Tasks assigned to user ${currentUserId}:`, filteredTasks.length);
//       setTasks(filteredTasks);

//     } catch (error: any) {
//       console.error('Error fetching tasks:', error);
//       setTasks([]);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchTasks();
//   }, [currentUserId]);

//   const handleEdit = (_id: number) => {
//     // Edit logic
//   };

//   const handleDelete = async (id: number) => {
//     if (confirm('Are you sure you want to delete this task?')) {
//       setTasks(tasks.filter((task) => task.id !== id));
//     }
//   };

//   const handleStatusChange = (taskId: number, newStatus: string) => {
//     setTasks(prev =>
//       prev.map(task =>
//         task.id === taskId ? { ...task, status: newStatus } : task
//       )
//     );
//   };

//   const handleDownload = () => {
//     const csv = [
//       ['Title', 'Description', 'Priority', 'Status', 'Due Date', 'Created At'],
//       ...tasks.map(({ title, description, priority, status, due_date, created_at }) => [
//         title,
//         description,
//         priority,
//         status,
//         new Date(due_date).toLocaleDateString(),
//         created_at ? new Date(created_at).toLocaleString() : 'N/A',
//       ]),
//     ]
//       .map((row) => row.join(','))
//       .join('\n');

//     const blob = new Blob([csv], { type: 'text/csv' });
//     const a = document.createElement('a');
//     a.href = URL.createObjectURL(blob);
//     a.download = `${currentUserName}-assigned-tasks.csv`;
//     a.click();
//   };

//   const getStatusColor = (status: string) => {
//     switch (status.toLowerCase()) {
//       case 'completed':
//         return 'bg-green-100 text-green-800';
//       case 'in_progress':
//         return 'bg-blue-100 text-blue-800';
//       default:
//         return 'bg-yellow-100 text-yellow-800';
//     }
//   };

//   const getPriorityColor = (priority: string) => {
//     switch (priority.toLowerCase()) {
//       case 'high':
//         return 'bg-red-100 text-red-800';
//       case 'medium':
//         return 'bg-yellow-100 text-yellow-800';
//       default:
//         return 'bg-green-100 text-green-800';
//     }
//   };

//   const filterTasks = (tasks: ListTask[]) => {
//     return tasks.filter(
//       (task) =>
//         task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         task.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         task.priority.toLowerCase().includes(searchTerm.toLowerCase())
//     );
//   };

//   const filteredTasks = filterTasks(tasks);
//   const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
//   const paginatedTasks = filteredTasks.slice(
//     (currentPage - 1) * ITEMS_PER_PAGE,
//     currentPage * ITEMS_PER_PAGE
//   );

//   return (
//     <div className="max-w-7xl mx-auto p-3 sm:p-6 bg-gray-100 min-h-screen space-y-6">
//       <div className="bg-white rounded-lg shadow-md p-4">
//         <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
//           <div className="relative flex-1">
//             <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
//             <input
//               type="text"
//               placeholder="Search tasks..."
//               value={searchTerm}
//               onChange={(e) => setSearchTerm(e.target.value)}
//               className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//             />
//           </div>

//           <button
//             onClick={fetchTasks}
//             disabled={loading}
//             className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
//           >
//             <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
//             Refresh
//           </button>
//         </div>
//       </div>

//       <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
//         <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 space-y-4 lg:space-y-0">
//           <div>
//             <h2 className="text-lg sm:text-xl font-bold text-gray-700">
//               My Tasks
//             </h2>
//             <p className="text-sm text-gray-500 mt-1">
//               Tasks assigned to you
//             </p>
//           </div>

//           <button
//             onClick={handleDownload}
//             className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
//           >
//             <Download className="w-4 h-4 mr-2" />
//             Download
//           </button>
//         </div>

//         {loading ? (
//           <div className="text-center py-12">
//             <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
//             <p className="mt-2 text-gray-500">Loading tasks...</p>
//           </div>
//         ) : (
//           <>
//             <div className="hidden lg:block overflow-x-auto">
//               <table className="w-full text-sm text-left">
//                 <thead className="bg-gray-100 text-gray-600">
//                   <tr>
//                     <th className="px-4 py-3 font-medium">Title</th>
//                     <th className="px-4 py-3 font-medium">Description</th>
//                     <th className="px-4 py-3 font-medium">Priority</th>
//                     <th className="px-4 py-3 font-medium">Due Date</th>
//                     <th className="px-4 py-3 font-medium">Status</th>
//                     <th className="px-4 py-3 font-medium">Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {paginatedTasks.length === 0 ? (
//                     <tr>
//                       <td colSpan={6} className="text-center py-8 text-gray-500">
//                         <div className="flex flex-col items-center">
//                           <List className="w-12 h-12 text-gray-300 mb-2" />
//                           <p>No tasks found</p>
//                         </div>
//                       </td>
//                     </tr>
//                   ) : (
//                     paginatedTasks.map((task) => (
//                       <tr key={task.id} className="border-b hover:bg-gray-50 transition-colors">
//                         <td className="px-4 py-3 font-medium">{task.title}</td>
//                         <td className="px-4 py-3 max-w-xs truncate">{task.description}</td>
//                         <td className="px-4 py-3">
//                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
//                             {task.priority}
//                           </span>
//                         </td>
//                         <td className="px-4 py-3">
//                           {new Date(task.due_date).toLocaleDateString()}
//                         </td>
//                         <td className="px-4 py-3">
//                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
//                             {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
//                           </span>
//                         </td>
//                         <td className="px-4 py-3">
//                           <div className="flex items-center space-x-2">
//                             <select
//                               value={task.status}
//                               onChange={(e) => handleStatusChange(task.id, e.target.value)}
//                               className="text-xs border rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
//                             >
//                               <option value="pending">Pending</option>
//                               <option value="in_progress">In Progress</option>
//                               <option value="completed">Completed</option>
//                             </select>
//                             <button
//                               onClick={() => handleEdit(task.id)}
//                               className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
//                             >
//                               <Edit className="w-4 h-4" />
//                             </button>
//                             <button
//                               onClick={() => handleDelete(task.id)}
//                               className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
//                             >
//                               <Trash2 className="w-4 h-4" />
//                             </button>
//                           </div>
//                         </td>
//                       </tr>
//                     ))
//                   )}
//                 </tbody>
//               </table>
//             </div>

//             <div className="lg:hidden space-y-4">
//               {paginatedTasks.length === 0 ? (
//                 <div className="text-center py-12 text-gray-500">
//                   <List className="w-16 h-16 text-gray-300 mb-4 mx-auto" />
//                   <p className="text-lg font-medium">No tasks found</p>
//                 </div>
//               ) : (
//                 paginatedTasks.map((task) => (
//                   <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
//                     <div className="flex justify-between items-start mb-3">
//                       <h3 className="font-semibold text-gray-900">{task.title}</h3>
//                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
//                         {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
//                       </span>
//                     </div>

//                     <p className="text-sm text-gray-600 mb-3">{task.description}</p>

//                     <div className="space-y-2 mb-4">
//                       <div className="flex items-center text-sm">
//                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)} mr-2`}>
//                           {task.priority}
//                         </span>
//                         <Calendar className="w-4 h-4 mr-1 text-gray-400" />
//                         {new Date(task.due_date).toLocaleDateString()}
//                       </div>
//                     </div>

//                     <div className="flex gap-2">
//                       <select
//                         value={task.status}
//                         onChange={(e) => handleStatusChange(task.id, e.target.value)}
//                         className="flex-1 px-3 py-2 border rounded-lg text-sm"
//                       >
//                         <option value="pending">Pending</option>
//                         <option value="in_progress">In Progress</option>
//                         <option value="completed">Completed</option>
//                       </select>

//                       <button
//                         onClick={() => handleEdit(task.id)}
//                         className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg"
//                       >
//                         <Edit className="w-4 h-4" />
//                       </button>
//                       <button
//                         onClick={() => handleDelete(task.id)}
//                         className="px-3 py-2 bg-red-50 text-red-600 rounded-lg"
//                       >
//                         <Trash2 className="w-4 h-4" />
//                       </button>
//                     </div>
//                   </div>
//                 ))
//               )}
//             </div>

//             {totalPages > 1 && (
//               <div className="mt-6 flex justify-between items-center">
//                 <p className="text-sm text-gray-600">
//                   Showing {paginatedTasks.length} of {filteredTasks.length} entries
//                 </p>

//                 <div className="flex items-center space-x-2">
//                   <button
//                     disabled={currentPage === 1}
//                     onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
//                     className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
//                   >
//                     Previous
//                   </button>
//                   <span className="text-sm text-gray-600">
//                     Page {currentPage} of {totalPages}
//                   </span>
//                   <button
//                     disabled={currentPage === totalPages}
//                     onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
//                     className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
//                   >
//                     Next
//                   </button>
//                 </div>
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

import React, { useEffect, useState } from 'react';
import { Download, Edit, Search, Trash2, List, Calendar, RefreshCw, Users, ClipboardList } from 'lucide-react';
import { getTasksForUser } from '../api';

const ITEMS_PER_PAGE = 5;

interface ListTask {
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

interface TasklistProps {
  currentUserId: number;
  currentUserRole: 'manager' | 'fieldofficer' | 'farmer';
  currentUserName?: string;
}

export const Tasklist: React.FC<TasklistProps> = ({
  currentUserId ,
  currentUserRole,
  currentUserName = 'User'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [tasks, setTasks] = useState<ListTask[]>([]);
  const [loading, setLoading] = useState(false);

  // NEW: State for field officer tasks
  const [foSearchTerm, setFoSearchTerm] = useState('');
  const [foCurrentPage, setFoCurrentPage] = useState(1);
  const [fieldOfficerTasks, setFieldOfficerTasks] = useState<ListTask[]>([]);
  const [foLoading, setFoLoading] = useState(false);

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

      const filteredTasks = tasksData.filter((task: any) =>
        task.assigned_to && task.assigned_to.id === currentUserId
      );

      console.log(`Tasks assigned to user ${currentUserId}:`, filteredTasks.length);
      setTasks(filteredTasks);

    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  // NEW: Fetch tasks created by field officers
  const fetchFieldOfficerTasks = async () => {
    if (currentUserRole !== 'fieldofficer') return;

    setFoLoading(true);
    try {
      console.log('Fetching tasks created by field officer:', currentUserId);
      const response = await getTasksForUser(currentUserId);

      const tasksData = response.data.results
        ? response.data.results
        : (Array.isArray(response.data) ? response.data : []);

      // Filter tasks created by the current field officer
      const createdTasks = tasksData.filter((task: any) =>
        task.created_by && task.created_by.id === currentUserId
      );

      console.log(`Tasks created by field officer ${currentUserId}:`, createdTasks.length);
      setFieldOfficerTasks(createdTasks);

    } catch (error: any) {
      console.error('Error fetching field officer tasks:', error);
      setFieldOfficerTasks([]);
    } finally {
      setFoLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    if (currentUserRole === 'fieldofficer') {
      fetchFieldOfficerTasks();
    }
  }, [currentUserId, currentUserRole]);

  const handleEdit = (_id: number) => {
    // Edit logic
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this task?')) {
      setTasks(tasks.filter((task) => task.id !== id));
    }
  };

  const handleStatusChange = (taskId: number, newStatus: string) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId ? { ...task, status: newStatus } : task
      )
    );
  };

  // NEW: Handle status change for field officer tasks
  const handleFoStatusChange = (taskId: number, newStatus: string) => {
    setFieldOfficerTasks(prev =>
      prev.map(task =>
        task.id === taskId ? { ...task, status: newStatus } : task
      )
    );
  };

  const handleDownload = () => {
    const csv = [
      ['Title', 'Description', 'Priority', 'Status', 'Due Date', 'Created At'],
      ...tasks.map(({ title, description, priority, status, due_date, created_at }) => [
        title,
        description,
        priority,
        status,
        new Date(due_date).toLocaleDateString(),
        created_at ? new Date(created_at).toLocaleString() : 'N/A',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentUserName}-assigned-tasks.csv`;
    a.click();
  };

  // NEW: Download field officer tasks
  const handleFoDownload = () => {
    const csv = [
      ['Title', 'Description', 'Priority', 'Status', 'Assigned To', 'Due Date', 'Created At'],
      ...fieldOfficerTasks.map(({ title, description, priority, status, assigned_to, due_date, created_at }) => [
        title,
        description,
        priority,
        status,
        `${assigned_to.first_name} ${assigned_to.last_name}`,
        new Date(due_date).toLocaleDateString(),
        created_at ? new Date(created_at).toLocaleString() : 'N/A',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentUserName}-assigned-to-farmers.csv`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const filterTasks = (tasks: ListTask[]) => {
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.priority.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // NEW: Filter field officer tasks
  const filterFoTasks = (tasks: ListTask[]) => {
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(foSearchTerm.toLowerCase()) ||
        task.description.toLowerCase().includes(foSearchTerm.toLowerCase()) ||
        task.status.toLowerCase().includes(foSearchTerm.toLowerCase()) ||
        task.priority.toLowerCase().includes(foSearchTerm.toLowerCase()) ||
        `${task.assigned_to.first_name} ${task.assigned_to.last_name}`.toLowerCase().includes(foSearchTerm.toLowerCase())
    );
  };

  const filteredTasks = filterTasks(tasks);
  const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // NEW: Pagination for field officer tasks
  const filteredFoTasks = filterFoTasks(fieldOfficerTasks);
  const foTotalPages = Math.ceil(filteredFoTasks.length / ITEMS_PER_PAGE);
  const paginatedFoTasks = filteredFoTasks.slice(
    (foCurrentPage - 1) * ITEMS_PER_PAGE,
    foCurrentPage * ITEMS_PER_PAGE
  );

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
              <ClipboardList className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Task List</h1>
            </div>
          </div>

          {/* Content Card */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-4 bg-opacity-95">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={fetchTasks}
            disabled={loading}
            className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* EXISTING TABLE - Tasks assigned to me */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-700">
              My Tasks
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Tasks assigned to you
            </p>
          </div>

          <button
            onClick={handleDownload}
            className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading tasks...</p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    {/* <th className="px-4 py-3 font-medium">Priority</th> */}
                    <th className="px-4 py-3 font-medium">Due Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">
                        <div className="flex flex-col items-center">
                          <List className="w-12 h-12 text-gray-300 mb-2" />
                          <p>No tasks found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedTasks.map((task) => (
                      <tr key={task.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium">{task.title}</td>
                        <td className="px-4 py-3 max-w-xs truncate">{task.description}</td>
                        {/* <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </td> */}
                        <td className="px-4 py-3">
                          {new Date(task.due_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                            {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <select
                              value={task.status}
                              onChange={(e) => handleStatusChange(task.id, e.target.value)}
                              className="text-xs border rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                            <button
                              onClick={() => handleEdit(task.id)}
                              className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(task.id)}
                              className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-4">
              {paginatedTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <List className="w-16 h-16 text-gray-300 mb-4 mx-auto" />
                  <p className="text-lg font-medium">No tasks found</p>
                </div>
              ) : (
                paginatedTasks.map((task) => (
                  <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900">{task.title}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                        {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-3">{task.description}</p>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)} mr-2`}>
                          {task.priority}
                        </span>
                        <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                        {new Date(task.due_date).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>

                      <button
                        onClick={() => handleEdit(task.id)}
                        className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="px-3 py-2 bg-red-50 text-red-600 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Showing {paginatedTasks.length} of {filteredTasks.length} entries
                </p>

                <div className="flex items-center space-x-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                    className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                    className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* NEW TABLE - Tasks I assigned to farmers (only for field officers) */}
      {currentUserRole === 'fieldofficer' && (
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 space-y-4 lg:space-y-0">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-700 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600" />
                Tasks Assigned to Farmers
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Tasks you have assigned to farmers
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={fetchFieldOfficerTasks}
                disabled={foLoading}
                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${foLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleFoDownload}
                className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search assigned tasks..."
                value={foSearchTerm}
                onChange={(e) => setFoSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {foLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-500">Loading tasks...</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Title</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Assigned To</th>
                      {/* <th className="px-4 py-3 font-medium">Priority</th> */}
                      <th className="px-4 py-3 font-medium">Due Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFoTasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-500">
                          <div className="flex flex-col items-center">
                            <Users className="w-12 h-12 text-gray-300 mb-2" />
                            <p>No tasks assigned to farmers</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedFoTasks.map((task) => (
                        <tr key={task.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium">{task.title}</td>
                          <td className="px-4 py-3 max-w-xs truncate">{task.description}</td>
                          <td className="px-4 py-3">
                            {task.assigned_to.first_name} {task.assigned_to.last_name}
                          </td>
                          {/* <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                              {task.priority}
                            </span>
                          </td> */}
                          <td className="px-4 py-3">
                            {new Date(task.due_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                              {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden space-y-4">
                {paginatedFoTasks.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-16 h-16 text-gray-300 mb-4 mx-auto" />
                    <p className="text-lg font-medium">No tasks assigned to farmers</p>
                  </div>
                ) : (
                  paginatedFoTasks.map((task) => (
                    <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-semibold text-gray-900">{task.title}</h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                          {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 mb-3">{task.description}</p>

                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-500">
                          <Users className="w-4 h-4 mr-2" />
                          <span className="font-medium">Assigned to:</span> {task.assigned_to.first_name} {task.assigned_to.last_name}
                        </div>
                        <div className="flex items-center text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)} mr-2`}>
                            {task.priority}
                          </span>
                          <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                          {new Date(task.due_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {foTotalPages > 1 && (
                <div className="mt-6 flex justify-between items-center">
                  <p className="text-sm text-gray-600">
                    Showing {paginatedFoTasks.length} of {filteredFoTasks.length} entries
                  </p>

                  <div className="flex items-center space-x-2">
                    <button
                      disabled={foCurrentPage === 1}
                      onClick={() => setFoCurrentPage(Math.max(foCurrentPage - 1, 1))}
                      className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {foCurrentPage} of {foTotalPages}
                    </span>
                    <button
                      disabled={foCurrentPage === foTotalPages}
                      onClick={() => setFoCurrentPage(Math.min(foCurrentPage + 1, foTotalPages))}
                      className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
          </div>
        </div>
      </div>
    </div>
  );
};
