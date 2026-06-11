import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTasksForUser, updateTaskStatus } from '../api';
import { useIrrigationSchedule } from '../hooks/useIrrigationSchedule';
import {
  IrrigationDayCell,
  IrrigationDetailCard,
} from './Irrigation/IrrigationCalendarParts';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekDaysMobile = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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

interface CalendarProps {
  currentUserId: number;
  currentUserRole: 'manager' | 'fieldofficer' | 'farmer';
}

const Calendar: React.FC<CalendarProps> = ({ currentUserId, currentUserRole }) => {
  const { schedule: irrigationSchedule, irrigationType } = useIrrigationSchedule(true);

  const irrigationByDate = useMemo(() => {
    const map = new Map<string, (typeof irrigationSchedule)[number]>();
    irrigationSchedule.forEach((row) => map.set(row.isoDate, row));
    return map;
  }, [irrigationSchedule]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedDate, setSelectedDate] = useState<{date: Date, day: number} | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [currentUserId]);

  const fetchTasks = async () => {
    if (!currentUserId) {
      console.error('No currentUserId provided');
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching tasks for farmer ID:', currentUserId);
      const response = await getTasksForUser(currentUserId);
      
      const tasksData = response.data.results 
        ? response.data.results 
        : (Array.isArray(response.data) ? response.data : []);
      
      const filteredTasks = tasksData.filter((task: any) =>
        task.assigned_to && task.assigned_to.id === currentUserId
      );
      
      console.log('Tasks loaded for farmer calendar:', filteredTasks.length);
      setTasks(filteredTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  // const handleStatusChange = async (taskId: number, newStatus: string) => {
  //   // Optimistically update UI
  //   setTasks(prev =>
  //     prev.map(task =>
  //       task.id === taskId ? { ...task, status: newStatus } : task
  //     )
  //   );

  //   // Update in backend
  //   try {
  //     await updateTaskStatus(taskId, newStatus);
  //     console.log('Task status updated successfully');
  //   } catch (error) {
  //     console.error('Failed to update task status:', error);
  //     // Revert on error
  //     fetchTasks();
  //   }
  // };

const handleStatusChange = async (taskId: number, newStatus: string) => {
  console.log('=== STATUS UPDATE DEBUG ===');
  console.log('Task ID:', taskId);
  console.log('New Status:', newStatus);
  console.log('Token:', localStorage.getItem('token')?.substring(0, 20) + '...');
  
  const previousTasks = [...tasks];
  
  setTasks(prev =>
    prev.map(task =>
      task.id === taskId ? { ...task, status: newStatus } : task
    )
  );

  try {
    console.log('Calling API...');
    const response = await updateTaskStatus(taskId, newStatus);
    console.log('✅ Success:', response.data);
    await fetchTasks();
  } catch (error: any) {
    console.error('❌ Error:', error);
    console.error('Response:', error.response);
    console.error('Status code:', error.response?.status);
    console.error('Error data:', error.response?.data);
    
    setTasks(previousTasks);
    alert(`Failed: ${error.response?.data?.detail || error.message}`);
  }
};

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isToday = (date: Date, day: number) => {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           day === today.getDate();
  };

  const formatDate = (date: Date, day: number) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  };

  const getIrrigationForDay = (date: Date, day: number) =>
    irrigationByDate.get(formatDate(date, day));

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const getTasksForDate = (date: Date, day: number): Task[] => {
    const dateString = formatDate(date, day);
    
    return tasks.filter((task) => {
      if (!task.due_date) return false;
      
      try {
        const taskDate = task.due_date.split('T')[0];
        return taskDate === dateString;
      } catch (error) {
        console.error('Error parsing task date:', task.due_date, error);
        return false;
      }
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'border-red-400 bg-red-50';
      case 'medium':
        return 'border-yellow-400 bg-yellow-50';
      default:
        return 'border-green-400 bg-green-50';
    }
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          className={`${isMobile ? 'h-12 sm:h-16' : 'h-24 sm:h-32'} border border-gray-100 rounded-lg bg-gray-50`}
        />
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const tasksForDay = getTasksForDate(currentDate, day);
      const todayFlag = isToday(currentDate, day);
      const hasTasksFlag = tasksForDay.length > 0;
      const irrigationRow = getIrrigationForDay(currentDate, day);

      days.push(
        <div
          key={day}
          onClick={() => setSelectedDate({date: currentDate, day})}
          className={`
            p-1 sm:p-2 border rounded-lg transition-colors relative cursor-pointer overflow-hidden
            ${irrigationRow
              ? isMobile ? 'min-h-[4.5rem] sm:min-h-24' : 'min-h-28 sm:min-h-32'
              : isMobile ? 'h-12 sm:h-16' : 'h-24 sm:h-32'}
            ${irrigationRow ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-inset ring-emerald-200' : ''}
            ${todayFlag 
              ? 'bg-blue-50 border-blue-300 shadow-sm' 
              : !irrigationRow && hasTasksFlag 
                ? 'bg-green-50 border-green-200'
                : !irrigationRow ? 'hover:bg-gray-50 border-gray-200' : 'hover:bg-emerald-100/80'
            }
            ${selectedDate && selectedDate.day === day && 
              selectedDate.date.getMonth() === currentDate.getMonth() && 
              selectedDate.date.getFullYear() === currentDate.getFullYear()
              ? 'ring-2 ring-blue-400' 
              : ''
            }
          `}
        >
          <div className={`
            ${isMobile ? 'text-xs' : 'text-sm'} 
            font-semibold mb-0.5
            ${todayFlag ? 'text-blue-600' : hasTasksFlag ? 'text-green-700' : 'text-gray-700'}
          `}>
            {day}
          </div>

          {irrigationRow ? (
            <IrrigationDayCell row={irrigationRow} compact={isMobile} />
          ) : (
            <div className="overflow-hidden">
              {renderTaskIndicator(tasksForDay)}
            </div>
          )}

          {isMobile && tasksForDay.length > 0 && !irrigationRow && (
            <div className="absolute top-0 right-0 -mt-1 -mr-1">
              <div className="bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                {tasksForDay.length > 9 ? '9+' : tasksForDay.length}
              </div>
            </div>
          )}
        </div>
      );
    }

    return days;
  };
  
  const renderTaskIndicator = (tasksForDay: Task[]) => {
    if (tasksForDay.length === 0) return null;
    
    if (isMobile) {
      return (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {tasksForDay.slice(0, 3).map((task, index) => (
            <div
              key={index}
              className={`w-1.5 h-1.5 rounded-full ${
                task.priority === 'high' ? 'bg-red-400' : 
                task.priority === 'medium' ? 'bg-yellow-400' : 
                'bg-green-400'
              }`}
            />
          ))}
          {tasksForDay.length > 3 && (
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          )}
        </div>
      );
    } else {
      return (
        <div className="space-y-1">
          {tasksForDay.slice(0, 3).map((task, index) => (
            <div
              key={index}
              className="text-xs font-medium truncate text-gray-600"
            >
              <span className="truncate">{task.title}</span>
            </div>
          ))}
          {tasksForDay.length > 3 && (
            <div className="text-xs text-gray-400 truncate">
              +{tasksForDay.length - 3} more
            </div>
          )}
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={handlePrevMonth} 
              className="p-1 sm:p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button 
              onClick={handleNextMonth} 
              className="p-1 sm:p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="p-2 sm:p-4 md:p-6">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1 sm:mb-2">
            {(isMobile ? weekDaysMobile : weekDays).map((day) => (
              <div
                key={day}
                className="text-center font-medium text-gray-600 py-1 sm:py-2 text-xs sm:text-sm"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {renderCalendarDays()}
          </div>
          {loading && (
            <p className="text-center text-gray-500 text-xs mt-2">Loading tasks...</p>
          )}
        </div>

        {/* Selected Date Tasks */}
        {selectedDate && (
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="text-sm font-medium text-gray-800 mb-2">
              Tasks for {selectedDate.date.toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric',
                year: 'numeric' 
              })}
            </div>
            {(() => {
              const selectedTasks = getTasksForDate(selectedDate.date, selectedDate.day);
              const irrigationForDay = getIrrigationForDay(selectedDate.date, selectedDate.day);

              if (!irrigationForDay && selectedTasks.length === 0) {
                return <div className="text-xs text-gray-500">No tasks scheduled for this date</div>;
              }
              
              return (
                <div className="space-y-3">
                  {irrigationForDay && (
                    <IrrigationDetailCard
                      row={irrigationForDay}
                      irrigationType={irrigationType}
                    />
                  )}
                  {selectedTasks.length === 0 && irrigationForDay && (
                    <div className="text-xs text-gray-500">No tasks for this date.</div>
                  )}
                  {selectedTasks.map((task) => (
                    <div key={task.id} className={`p-4 rounded-lg border-l-4 ${getPriorityColor(task.priority)}`}>
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
                          {task.status === 'in_progress' ? 'In Progress' : 
                           task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 
                            'bg-green-100 text-green-700'}`}>
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
                      
                      {/* Status Dropdown - NEW */}
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
            })()}
          </div>
        )}

        {/* Today's Tasks (Mobile) */}
        {isMobile && !selectedDate && (
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="text-sm font-medium text-gray-800 mb-2">Today's Tasks</div>
            {(() => {
              const today = new Date();
              const todayTasks = getTasksForDate(today, today.getDate());
              
              if (todayTasks.length === 0) {
                return <div className="text-xs text-gray-500">No tasks scheduled for today</div>;
              }
              
              return (
                <div className="space-y-3">
                  {todayTasks.map((task) => (
                    <div key={task.id} className={`p-3 rounded border-l-4 ${getPriorityColor(task.priority)}`}>
                      <div className="font-medium text-gray-800 text-sm mb-1">{task.title}</div>
                      <div className="text-gray-600 text-xs mb-2">{task.description}</div>
                      <div className="mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 
                            'bg-green-100 text-green-700'}`}>
                          {task.priority} priority
                        </span>
                      </div>
                      
                      {/* Status Dropdown for Mobile */}
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
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
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default Calendar;