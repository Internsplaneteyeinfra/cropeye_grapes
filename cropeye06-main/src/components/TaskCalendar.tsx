// 

import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, X, Droplets, CloudRain } from 'lucide-react';
import { getTasksForUser, addTask, getContactDetails, getFarmersByFieldOfficer, updateTaskStatus } from '../api';
import { useIrrigationSchedule } from '../hooks/useIrrigationSchedule';
import { IrrigationDayCell } from './Irrigation/IrrigationCalendarParts';
import './Irrigation/Irrigation.css';

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
  const {
    schedule: irrigationSchedule,
    loading: irrigationLoading,
    plotName,
    irrigationType,
    getETRangeColor,
    error: irrigationError,
  } = useIrrigationSchedule(true);
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
  }, [currentUserId, currentUserRole]);

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
      
      let filteredTasks: Task[];
      if (currentUserRole === 'fieldofficer') {
        // Same task set as Tasklist for field officers: assigned to me + tasks I created for farmers
        const assigned = tasksData.filter(
          (task: any) => task.assigned_to && task.assigned_to.id === currentUserId
        );
        const createdByMe = tasksData.filter(
          (task: any) => task.created_by && task.created_by.id === currentUserId
        );
        const byId = new Map<number, Task>();
        [...assigned, ...createdByMe].forEach((t: any) => byId.set(t.id, t));
        filteredTasks = Array.from(byId.values());
      } else {
        filteredTasks = tasksData.filter((task: any) =>
          task.assigned_to && task.assigned_to.id === currentUserId
        );
      }

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
    const contactData =
      (response.data && (response.data as any).contacts) ? (response.data as any).contacts : response.data;
    
    if (currentUserRole === 'fieldofficer') {
      // Field officer: show all assignable users returned by backend
      // Accept multiple possible shapes/keys from backend.
      const farmers = (contactData as any)?.farmers ?? (contactData as any)?.farmers_list ?? [];
      const fieldOfficers =
        (contactData as any)?.field_officers ??
        (contactData as any)?.fieldOfficers ??
        [];
      const managers = (contactData as any)?.managers ?? [];
      const owners = (contactData as any)?.owners ?? [];
      const admins = (contactData as any)?.admins ?? [];

      const all = [
        ...(Array.isArray(farmers) ? farmers : []),
        ...(Array.isArray(fieldOfficers) ? fieldOfficers : []),
        ...(Array.isArray(managers) ? managers : []),
        ...(Array.isArray(owners) ? owners : []),
        ...(Array.isArray(admins) ? admins : []),
      ];

      // De-dup by id
      const byId = new Map<number, any>();
      all.forEach((u: any) => {
        const id = Number(u?.id);
        if (!Number.isNaN(id)) byId.set(id, u);
      });

      const merged = Array.from(byId.values());
      console.log('TaskCalendar: assignable users (fieldofficer):', merged.length);
      setContacts(merged);
      
    } else if (currentUserRole === 'manager') {
      const allContacts = [
        ...(((contactData as any)?.field_officers ?? (contactData as any)?.fieldOfficers ?? []) as any[]),
        ...(((contactData as any)?.farmers ?? []) as any[]),
      ];
      setContacts(Array.isArray(allContacts) ? allContacts : []);
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

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    // Optimistic update
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId ? { ...task, status: newStatus } : task
      )
    );

    try {
      await updateTaskStatus(taskId, newStatus);
      console.log(`Calendar Task ${taskId} status updated to ${newStatus}`);
    } catch (error) {
      console.error('Failed to update task status in calendar:', error);
      alert('Failed to update task status. Reverting change.');
      // Revert if failed
      fetchTasks();
    }
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

  const irrigationByDate = useMemo(() => {
    const map = new Map<string, (typeof irrigationSchedule)[number]>();
    irrigationSchedule.forEach((row) => map.set(row.isoDate, row));
    return map;
  }, [irrigationSchedule]);

  const getIrrigationForDate = (date: Date) =>
    irrigationByDate.get(format(date, 'yyyy-MM-dd'));

  const renderIrrigationDetailCard = (row: (typeof irrigationSchedule)[number]) => (
    <div
      className={`p-4 rounded-lg border-l-4 mb-4 ${
        row.needsIrrigation ? 'bg-blue-50 border-blue-500' : 'bg-gray-50 border-gray-400'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-800 text-sm sm:text-base">
          Irrigation — {row.date}
          {row.isToday && (
            <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
              Today
            </span>
          )}
        </h3>
        <span
          className={`irrigation-action-badge ${row.needsIrrigation ? 'irrigate' : 'skip'}`}
          title={row.needsIrrigation ? 'Irrigate' : 'Skip'}
        >
          {row.needsIrrigation ? (
            <Droplets className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <CloudRain className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Rainfall</p>
          <p className="font-semibold text-gray-800">{Number(row.rainfall).toFixed(1)} mm</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Water req.</p>
          <p className="font-semibold text-blue-700">{row.waterRequired.toLocaleString()} L</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{irrigationType} time</p>
          <p className="font-semibold text-gray-800">{row.time}</p>
        </div>
      </div>
    </div>
  );

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
            const irrigationRow = getIrrigationForDate(day);
            
            return (
              <div
                key={day.toString()}
                onClick={() => handleDateClick(day)}
                className={`border-r border-b border-gray-200 last:border-r-0 flex flex-col justify-start p-1 transition-colors cursor-pointer relative
                ${irrigationRow ? 'min-h-28 sm:min-h-32 lg:min-h-36' : 'min-h-16 sm:min-h-20 lg:min-h-24'}
                ${irrigationRow ? 'bg-emerald-50/60 ring-1 ring-inset ring-emerald-200' : ''}
                ${isTodayDate ? 'bg-blue-100 text-blue-600 font-semibold' : 
                  selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') ? 'bg-green-100 text-green-600 font-semibold' :
                  !irrigationRow ? 'hover:bg-gray-50 bg-white text-gray-700' : 'hover:bg-emerald-100/80 text-gray-700'}`}
              >
                <span className={`text-sm sm:text-base mb-0.5 self-center
                  ${isTodayDate ? 'font-bold' : 
                    selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') ? 'font-bold' :
                    'font-medium'}`}>
                  {format(day, 'd')}
                </span>

                {irrigationRow && <IrrigationDayCell row={irrigationRow} />}
                
                {hasTasksOnDay && !irrigationRow && (
                  <div className="flex flex-col gap-0.5 w-full px-1 mt-1">
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

        <div className="mt-4 rounded-lg overflow-hidden border border-green-200 shadow-sm">
          <div className="bg-green-600 text-white px-3 py-2 text-sm font-semibold">
            7-Day Irrigation Schedule
          </div>
          {irrigationLoading ? (
            <p className="text-xs text-gray-500 p-4">Loading irrigation schedule...</p>
          ) : !plotName ? (
            <p className="text-xs text-gray-500 p-4">No plot found — irrigation data unavailable.</p>
          ) : irrigationSchedule.length === 0 ? (
            <p className="text-xs text-gray-500 p-4">No irrigation data for this plot yet.</p>
          ) : (
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-xs">
                <thead className="bg-green-100">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Date</th>
                    <th className="px-2 py-2 text-center font-medium">Action</th>
                    <th className="px-2 py-2 text-left font-medium">ETO</th>
                    <th className="px-2 py-2 text-left font-medium">Rainfall (mm)</th>
                    <th className="px-2 py-2 text-left font-medium">Water req. (L)</th>
                    <th className="px-2 py-2 text-left font-medium">{irrigationType} Time</th>
                  </tr>
                </thead>
                <tbody>
                  {irrigationSchedule.map((day, idx) => (
                    <tr
                      key={day.isoDate || idx}
                      className={`${idx % 2 ? 'bg-white' : 'bg-gray-50'} ${
                        day.isToday ? 'ring-2 ring-inset ring-blue-300' : ''
                      }`}
                    >
                      <td className="px-2 py-2 font-medium whitespace-nowrap">
                        <span>{day.date}</span>
                        {day.isToday && (
                          <span className="ml-1 bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-[10px]">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`irrigation-action-badge ${
                            day.needsIrrigation ? 'irrigate' : 'skip'
                          }`}
                        >
                          {day.needsIrrigation ? (
                            <Droplets className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <CloudRain className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${getETRangeColor(
                            day.etRange
                          )}`}
                        >
                          {day.etRange}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-600 font-medium">
                        {Number(day.rainfall).toFixed(1)}
                      </td>
                      <td className="px-2 py-2 text-blue-600 font-semibold">
                        {day.waterRequired.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-gray-800 font-medium whitespace-nowrap">
                        {day.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {irrigationError && (
            <p className="error-message-small mx-2 mb-2">{irrigationError}</p>
          )}
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
              const irrigationForDay = getIrrigationForDate(targetDate);
              
              if (!irrigationForDay && dateTasks.length === 0) {
                return (
                  <p className="text-gray-500 text-sm">
                    {selectedDate ? `No tasks scheduled for ${format(selectedDate, 'MMMM d, yyyy')}` : 'No tasks scheduled for today'}
                  </p>
                );
              }
              
              return (
                <div className="space-y-3">
                  {irrigationForDay && renderIrrigationDetailCard(irrigationForDay)}
                  {dateTasks.length === 0 && irrigationForDay && (
                    <p className="text-gray-500 text-sm">No tasks for this date.</p>
                  )}
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