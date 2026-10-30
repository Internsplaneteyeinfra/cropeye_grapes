import React, { useState, useEffect } from 'react';
import { Download, Edit, Search, Trash2, Save, Calendar, User, Users, FileText, MessageSquare, ListTodo } from 'lucide-react';

const ITEMS_PER_PAGE = 5;

interface Task {
  id: string;
  itemName: string;
  description: string;
  fieldOfficer: string;
  team: string;
  selectedDate: string;
  message: string;
  status?: 'Pending' | 'Completed' | 'InProcess';
  taskType?: string;
}

const MyList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [farmerTasks, setFarmerTasks] = useState<Task[]>([]);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editedTask, setEditedTask] = useState<Partial<Task>>({});

  // Sample data for demonstration
  useEffect(() => {
    // Simulated data since we can't make actual API calls
    const sampleTasks: Task[] = [
      {
        id: '1',
        itemName: 'Crop Inspection',
        description: 'Inspect wheat fields for pest damage',
        fieldOfficer: 'John Smith',
        team: 'Team A',
        selectedDate: '2024-12-15',
        message: 'Priority task for this week',
        status: 'Pending',
        taskType: 'Field Officer Task'
      },
      {
        id: '2',
        itemName: 'Soil Testing',
        description: 'Collect soil samples from north field',
        fieldOfficer: 'Sarah Johnson',
        team: 'Team B',
        selectedDate: '2024-12-16',
        message: 'Equipment ready for collection',
        status: 'InProcess',
        taskType: 'Field Officer Task'
      },
      {
        id: '3',
        itemName: 'Irrigation Check',
        description: 'Monitor irrigation systems',
        fieldOfficer: 'Mike Wilson',
        team: 'Team C',
        selectedDate: '2024-12-17',
        message: 'Check pressure levels',
        status: 'Completed',
        taskType: 'Farmer Task'
      }
    ];
    setTasks(sampleTasks);
  }, []);

  const handleEdit = (id: string) => {
    setEditTaskId(id);
    const allTasks = [...tasks, ...farmerTasks];
    const taskToEdit = allTasks.find((task) => task.id === id);
    if (taskToEdit) {
      setEditedTask({ ...taskToEdit });
    }
  };

  const handleSave = (id: string) => {
    const updatedTasks = tasks.map((task) =>
      task.id === id ? { ...task, ...editedTask } : task
    );
    setTasks(updatedTasks);
    setEditTaskId(null);
  };

  const handleDelete = (id: string) => {
    const updatedTasks = tasks.filter((task) => task.id !== id);
    setTasks(updatedTasks);
  };

  const handleExportCSV = () => {
    const header = ['ID', 'Item Name', 'Description', 'Field Officer', 'Team', 'Date', 'Message'];
    const csvRows = [
      header.join(','),
      ...allTasks.map((task) =>
        [task.id, task.itemName, task.description, task.fieldOfficer, task.team, task.selectedDate, task.message]
          .map((value) => `"${value}"`)
          .join(',')
      ),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'tasks.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const allTasks = [
    ...tasks.map(task => ({ ...task, taskType: task.taskType || 'Field Officer Task' })),
    ...farmerTasks.map(task => {
      const ft = task as any;
      return {
        id: String(ft.id),
        itemName: ft.itemName || ft.taskName || '',
        description: ft.description || '',
        fieldOfficer: ft.assignedByFieldOfficer || '',
        team: '',
        selectedDate: ft.selectedDate || ft.date || '',
        message: '',
        status: ft.status,
        taskType: 'Farmer Task',
      };
    }),
  ];

  const filteredTasks = allTasks.filter(
    (task) =>
      task.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.fieldOfficer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.team.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'InProcess':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const TaskCard = ({ task }: { task: Task }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          {editTaskId === task.id ? (
            <input
              className="text-lg font-semibold border border-gray-300 rounded px-2 py-1 w-full"
              value={editedTask.itemName || ''}
              onChange={(e) => setEditedTask({ ...editedTask, itemName: e.target.value })}
            />
          ) : (
            <h3 className="text-lg font-semibold text-gray-900">{task.itemName}</h3>
          )}
          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getStatusColor(task.status || 'Pending')}`}>
            {task.status || 'Pending'}
          </span>
        </div>
        <div className="flex gap-2 ml-4">
          {editTaskId === task.id ? (
            <button
              onClick={() => handleSave(task.id)}
              className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
            >
              <Save className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => handleEdit(task.id)}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Edit className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => handleDelete(task.id)}
            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <span className="text-gray-600">Officer:</span>
          {editTaskId === task.id ? (
            <input
              className="flex-1 border border-gray-300 rounded px-2 py-1"
              value={editedTask.fieldOfficer || ''}
              onChange={(e) => setEditedTask({ ...editedTask, fieldOfficer: e.target.value })}
            />
          ) : (
            <span className="text-gray-900">{task.fieldOfficer}</span>
          )}
        </div>

        {task.team && (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Team:</span>
            {editTaskId === task.id ? (
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1"
                value={editedTask.team || ''}
                onChange={(e) => setEditedTask({ ...editedTask, team: e.target.value })}
              />
            ) : (
              <span className="text-gray-900">{task.team}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <span className="text-gray-600">Date:</span>
          {editTaskId === task.id ? (
            <input
              type="date"
              className="flex-1 border border-gray-300 rounded px-2 py-1"
              value={editedTask.selectedDate || ''}
              onChange={(e) => setEditedTask({ ...editedTask, selectedDate: e.target.value })}
            />
          ) : (
            <span className="text-gray-900">{task.selectedDate}</span>
          )}
        </div>

        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-gray-500 mt-0.5" />
          <span className="text-gray-600">Description:</span>
          {editTaskId === task.id ? (
            <textarea
              className="flex-1 border border-gray-300 rounded px-2 py-1"
              rows={2}
              value={editedTask.description || ''}
              onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
            />
          ) : (
            <span className="text-gray-900 flex-1">{task.description}</span>
          )}
        </div>

        {task.message && (
          <div className="flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5" />
            <span className="text-gray-600">Message:</span>
            {editTaskId === task.id ? (
              <textarea
                className="flex-1 border border-gray-300 rounded px-2 py-1"
                rows={2}
                value={editedTask.message || ''}
                onChange={(e) => setEditedTask({ ...editedTask, message: e.target.value })}
              />
            ) : (
              <span className="text-gray-900 flex-1">{task.message}</span>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
            {task.taskType}
          </span>
        </div>
      </div>
    </div>
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
              <ListTodo className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">My Tasks</h1>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded-lg shadow-sm bg-opacity-95">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex flex-col space-y-4">

            {/* Search and Export */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-md">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full p-3 border border-gray-300 rounded-lg pr-10 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                <span className="sm:inline"></span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {/* Mobile Card View (sm and below) */}
          <div className="sm:hidden space-y-4">
            {paginatedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

          {/* Desktop Table View (md and above) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-sm font-semibold text-gray-700">
                  <th className="p-3">Item</th>
                  <th className="p-3">Officer</th>
                  <th className="p-3">Team</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Message</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task) => (
                  <tr key={task.id} className="border-b hover:bg-gray-50 text-sm">
                    <td className="p-3">
                      {editTaskId === task.id ? (
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={editedTask.itemName || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, itemName: e.target.value })}
                        />
                      ) : (
                        <span className="font-medium">{task.itemName}</span>
                      )}
                    </td>
                    <td className="p-3">
                      {editTaskId === task.id ? (
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={editedTask.fieldOfficer || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, fieldOfficer: e.target.value })}
                        />
                      ) : (
                        task.fieldOfficer
                      )}
                    </td>
                    <td className="p-3">
                      {editTaskId === task.id ? (
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={editedTask.team || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, team: e.target.value })}
                        />
                      ) : (
                        task.team
                      )}
                    </td>
                    <td className="p-3">
                      {editTaskId === task.id ? (
                        <input
                          type="date"
                          className="border rounded px-2 py-1"
                          value={editedTask.selectedDate || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, selectedDate: e.target.value })}
                        />
                      ) : (
                        task.selectedDate
                      )}
                    </td>
                    <td className="p-3 max-w-xs">
                      {editTaskId === task.id ? (
                        <textarea
                          className="border rounded px-2 py-1 w-full"
                          rows={2}
                          value={editedTask.description || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                        />
                      ) : (
                        <span className="line-clamp-2">{task.description}</span>
                      )}
                    </td>
                    <td className="p-3 max-w-xs">
                      {editTaskId === task.id ? (
                        <textarea
                          className="border rounded px-2 py-1 w-full"
                          rows={2}
                          value={editedTask.message || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, message: e.target.value })}
                        />
                      ) : (
                        <span className="line-clamp-2">{task.message}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status || 'Pending')}`}>
                        {task.status || 'Pending'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {task.taskType}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {editTaskId === task.id ? (
                          <button
                            onClick={() => handleSave(task.id)}
                            className="text-green-600 hover:text-green-800 p-1"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEdit(task.id)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginatedTasks.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No tasks found</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 sm:px-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredTasks.length)} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredTasks.length)} of {filteredTasks.length} results
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                <span className="text-sm text-gray-700 px-3">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyList;
