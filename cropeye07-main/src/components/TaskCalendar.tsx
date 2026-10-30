//

import React, { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { getTasksForUser, addTask, getContactDetails ,getFarmersByFieldOfficer  } from '../api';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

interface TaskCalendarProps {
  currentUserId: number;
  currentUserRole: 'manager' | 'fieldofficer' | 'farmer';
}

const TaskCalendar: React.FC<TaskCalendarProps> = ({ currentUserId, currentUserRole }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'pending',
    assigned_to_id: '',
    due_date: '',
  });

  useEffect(() => {
    fetchTasks();
    if (currentUserRole === 'manager' || currentUserRole === 'fieldofficer') {
      fetchContacts();
    }
  }, [currentUserId]);

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

      console.log('Tasks loaded for calendar:', filteredTasks.length);
      setTasks(filteredTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

// const fetchContacts = async () => {
//   try {
//     if (currentUserRole === 'fieldofficer') {
//       // Fetch only farmers created by this field officer
//       const response = await getFarmersByFieldOfficer(currentUserId);
//       const farmers = Array.isArray(response.data) ? response.data : response.data.results || [];

//       console.log('My farmers:', farmers.length);
//       setContacts(farmers);
//     } else if (currentUserRole === 'manager') {
//       // Managers can assign to all field officers and farmers
//       const response = await getContactDetails();
//       const contactData = response.data.contacts;
//       const allContacts = [
//         ...(contactData.field_officers || []),
//         ...(contactData.farmers || [])
//       ];
//       setContacts(allContacts);
//     }
//   } catch (error) {
//     console.error('Error fetching contacts:', error);
//     setContacts([]);
//   }
// };

const fetchContacts = async () => {
  try {
    const response = await getContactDetails();
    const contactData = response.data.contacts;

    if (currentUserRole === 'fieldofficer') {
      // TEMPORARY: Show all farmers (no filtering)
      // TODO: Backend needs to add created_by field or create new endpoint
      const allFarmers = contactData.farmers || [];

      console.log('Showing all farmers (not filtered):', allFarmers.length);
      setContacts(allFarmers);

    } else if (currentUserRole === 'manager') {
      const allContacts = [
        ...(contactData.field_officers || []),
        ...(contactData.farmers || [])
      ];
      setContacts(allContacts);
    }
  } catch (error) {
    console.error('Error fetching contacts:', error);
    setContacts([]);
  }
};


  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTask.title || !newTask.due_date || !newTask.assigned_to_id) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const taskData = {
        title: newTask.title,
        description: newTask.description,
        status: newTask.status,
        priority: newTask.priority,
        assigned_to_id: parseInt(newTask.assigned_to_id),
        due_date: new Date(newTask.due_date).toISOString(),
        created_by_id: currentUserId,
      };

      await addTask(taskData);

      alert('Task added successfully!');
      setShowAddTaskModal(false);
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        status: 'pending',
        assigned_to_id: '',
        due_date: '',
      });

      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Failed to add task. Please try again.');
    }
  };

  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start, end });

  const days: (Date | null)[] = [];
  const firstDayOfWeek = start.getDay();

  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }

  monthDays.forEach(day => days.push(day));

  const totalDaysInGrid = days.length;
  const remainingDaysInLastWeek = 7 - (totalDaysInGrid % 7);

  if (remainingDaysInLastWeek < 7) {
    for (let i = 0; i < remainingDaysInLastWeek; i++) {
      days.push(null);
    }
  }

  const handlePrevMonth = () => {
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
  };

  const getTasksForDate = (date: Date): Task[] => {
    const formatted = format(date, 'yyyy-MM-dd');

    return tasks.filter((task) => {
      if (!task.due_date) return false;

      try {
        const taskDate = format(new Date(task.due_date), 'yyyy-MM-dd');
        return taskDate === formatted;
      } catch (error) {
        console.error('Error parsing task date:', task.due_date, error);
        return false;
      }
    });
  };

  const handleStatusChange = (taskId: number, newStatus: string) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId ? { ...task, status: newStatus } : task
      )
    );
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-50 border-green-400';
      case 'in_progress':
        return 'bg-yellow-50 border-yellow-400';
      default:
        return 'bg-gray-50 border-gray-400';
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

  return (
    <div className="p-3 sm:p-6 bg-gray-100 min-h-screen">
      <div className="w-full p-4 sm:p-6 bg-white rounded-lg shadow-md">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
              My Task Calendar
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Today: {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-2">
            {(currentUserRole === 'manager' || currentUserRole === 'fieldofficer') && (
              <button
                onClick={() => setShowAddTaskModal(true)}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </button>
            )}

            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-base sm:text-lg font-medium text-gray-700 min-w-[120px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0 mb-4">
          {weekDays.map((day) => (
            <div key={day} className="text-center font-medium text-gray-600 py-3 text-sm border-b border-gray-200">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0 border border-gray-200 rounded-lg overflow-hidden">
          {days.map((day, index) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="h-16 sm:h-20 lg:h-24 border-r border-b border-gray-200 bg-gray-50 last:border-r-0"
                />
              );
            }

            const isTodayDate = isToday(day);
            const dayTasks = getTasksForDate(day);
            const hasTasksOnDay = dayTasks.length > 0;

            return (
              <div
                key={day.toString()}
                onClick={() => handleDateClick(day)}
                className={`h-16 sm:h-20 lg:h-24 border-r border-b border-gray-200 last:border-r-0 flex flex-col items-center justify-start p-1 transition-colors cursor-pointer relative
                ${isTodayDate ? 'bg-blue-100 text-blue-600 font-semibold' :
                  selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') ? 'bg-green-100 text-green-600 font-semibold' :
                  'hover:bg-gray-50 bg-white text-gray-700'}`}
              >
                <span className={`text-sm sm:text-base mb-1
                  ${isTodayDate ? 'font-bold' :
                    selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') ? 'font-bold' :
                    'font-medium'}`}>
                  {format(day, 'd')}
                </span>

                {hasTasksOnDay && (
                  <div className="flex flex-col gap-0.5 w-full px-1">
                    {dayTasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className={`text-xs truncate px-1 py-0.5 rounded ${getPriorityColor(task.priority)}`}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <div className="text-xs text-gray-500 px-1">
                        +{dayTasks.length - 2} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Details Section */}
      <div className="mt-6 sm:mt-8">
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
              {selectedDate ? `${format(selectedDate, 'MMMM d, yyyy')} Tasks` : "Today's Tasks"}
            </h2>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Show Today's Tasks
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-500">Loading tasks...</p>
            </div>
          ) : (
            (() => {
              const targetDate = selectedDate || new Date();
              const dateTasks = getTasksForDate(targetDate);

              if (dateTasks.length === 0) {
                return (
                  <p className="text-gray-500 text-sm">
                    {selectedDate ? `No tasks scheduled for ${format(selectedDate, 'MMMM d, yyyy')}` : 'No tasks scheduled for today'}
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {dateTasks.map((task) => (
                    <div key={task.id} className={`p-4 rounded-lg border-l-4 ${getStatusColor(task.status)}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-800 text-base">{task.title}</h3>
                          {task.description && (
                            <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2
                          ${task.status === 'completed' ? 'bg-green-100 text-green-800' :
                            task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'}`}>
                          {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-3 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                          Priority: {task.priority}
                        </span>

                        {task.created_at && (
                          <span className="text-xs text-gray-500">
                            Assigned: {new Date(task.created_at).toLocaleString()}
                          </span>
                        )}

                        {task.created_by && (
                          <span className="text-xs text-gray-500">
                            By: {task.created_by.first_name} {task.created_by.last_name}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <label className="text-xs font-medium text-gray-700 mr-2">Update Status:</label>
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className="text-sm border border-gray-300 rounded px-3 py-1 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-800">Add New Task</h3>
              <button
                onClick={() => setShowAddTaskModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={newTask.assigned_to_id}
                  onChange={(e) => setNewTask({ ...newTask, assigned_to_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select user</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name} ({contact.username})
                    </option>
                  ))}
                </select>
              </div> */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={newTask.assigned_to_id}
                  onChange={(e) => setNewTask({ ...newTask, assigned_to_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select user</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name || `${contact.first_name} ${contact.last_name}`} ({contact.phone || contact.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCalendar;
