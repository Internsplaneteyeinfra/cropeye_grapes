import React, { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addTask, getContactDetails, getTasks } from '../api';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Task {
  id: string;
  itemName: string;
  description: string;
  fieldOfficer: string;
  team: string;
  selectedDate: string;
  message: string;
  assignedTime?: string;
}

interface FieldOfficer {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string;
}

const CalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldOfficers, setFieldOfficers] = useState<FieldOfficer[]>([]);
  const [loadingFieldOfficers, setLoadingFieldOfficers] = useState(false);

  const [task, setTask] = useState<Omit<Task, 'id'>>({
    itemName: '',
    description: '',
    fieldOfficer: '',
    team: '',
    selectedDate: '',
    message: '',
  });

  useEffect(() => {
    getTasks()
      .then(({ data }) => {
        const records = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        setTasks(
          records.map((record: any) => ({
            id: String(record.id),
            itemName: record.title || record.task_name || '',
            description: record.description || '',
            fieldOfficer:
              record.assigned_to?.username ||
              record.assigned_to_username ||
              '',
            team: '',
            selectedDate: record.due_date || '',
            message: record.message || '',
            assignedTime: record.created_at,
          })),
        );
      })
      .catch((error) => {
        console.error('Failed to load Railway tasks:', error);
        setTasks([]);
      });
  }, []);

  // Fetch field officers for the dropdown
  useEffect(() => {
    const fetchFieldOfficers = async () => {
      try {
        setLoadingFieldOfficers(true);
        const response = await getContactDetails();
        let fieldOfficersData: FieldOfficer[] = [];
        
        if (response.data && response.data.contacts) {
          // Extract field officers from the contacts object
          if (response.data.contacts.field_officers && Array.isArray(response.data.contacts.field_officers)) {
            fieldOfficersData = response.data.contacts.field_officers.map((officer: any) => ({
              id: officer.id,
              name: officer.name || `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.username || 'Unknown',
              username: officer.username || 'unknown',
              email: officer.email || 'N/A',
              phone: officer.phone || officer.phone_number || 'N/A'
            }));
          }
        }
        
        setFieldOfficers(fieldOfficersData);
      } catch (error) {
        console.error('Failed to load Railway field officers:', error);
        setFieldOfficers([]);
      } finally {
        setLoadingFieldOfficers(false);
      }
    };

    fetchFieldOfficers();
  }, []);

  // Calculate calendar grid with empty boxes for realistic calendar layout
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start, end });
  
  // Create days array with empty boxes for proper calendar grid
  const days: (Date | null)[] = [];
  const firstDayOfWeek = start.getDay();
  
  // Add empty boxes for days before the first day of the month
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  
  // Add all days of the current month
  monthDays.forEach(day => days.push(day));
  
  // Add empty boxes to complete the last week if needed
  const totalDaysInGrid = days.length;
  const remainingDaysInLastWeek = 7 - (totalDaysInGrid % 7);
  if (remainingDaysInLastWeek < 7) {
    for (let i = 0; i < remainingDaysInLastWeek; i++) {
      days.push(null);
    }
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setTask((prev) => ({ ...prev, selectedDate: date.toDateString() }));
    setShowForm(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setTask({ ...task, [e.target.name]: e.target.value });
  };


  
  const handleAssignTask = async () => {
    const selectedOfficer = fieldOfficers.find(
      (officer) => officer.username === task.fieldOfficer,
    );
    if (!selectedOfficer || !selectedDate) {
      alert('Select a field officer and task date before assigning.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await addTask({
        title: task.itemName,
        description: task.description,
        status: 'pending',
        priority: 'medium',
        assigned_to_id: selectedOfficer.id,
        due_date: format(selectedDate, 'yyyy-MM-dd'),
      });
      const createdTask = response.data;
      if (createdTask) {
        setTasks((prev) => [
          ...prev,
          {
            id: String(createdTask.id),
            ...task,
            selectedDate: format(selectedDate, 'yyyy-MM-dd'),
          },
        ]);
      }
      alert('Task Assigned!');
      setShowForm(false);
      setSelectedDate(null);
      setTask({
        itemName: '',
        description: '',
        fieldOfficer: '',
        team: '',
        selectedDate: '',
        message: '',
      });
    } catch (error) {
      console.error('Failed to assign Railway task:', error);
      alert('Error assigning task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setSelectedDate(null);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 bg-gray-100 min-h-screen">
      {/* Calendar View */}
      <div className="w-full lg:w-2/3 p-4 bg-white rounded-lg shadow-md">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-0 mb-4">
          {weekDays.map((day) => (
            <div key={day} className="text-center font-medium text-gray-600 py-3 text-sm border-b border-gray-200">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days - Realistic Calendar Grid */}
        <div className="grid grid-cols-7 gap-0 border border-gray-200 rounded-lg overflow-hidden">
          {days.map((day, index) => {
            // Handle empty boxes (null values)
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="h-16 sm:h-20 lg:h-24 border-r border-b border-gray-200 bg-gray-50 last:border-r-0"
                >
                  {/* Empty box - no content */}
                </div>
              );
            }
            
            const isTodayDate = isToday(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            
            return (
              <button
                key={day.toString()}
                onClick={() => handleDateClick(day)}
                className={`h-16 sm:h-20 lg:h-24 border-r border-b border-gray-200 last:border-r-0 flex items-center justify-center transition-colors cursor-pointer
                  ${isTodayDate ? 'bg-blue-100 text-blue-600 font-semibold' : 
                    'hover:bg-gray-50 bg-white text-gray-700'}
                  ${!isCurrentMonth ? 'text-gray-400' : ''}
                `}
              >
                <span className={`text-sm sm:text-base
                  ${isTodayDate ? 'font-bold' : 'font-medium'}`}>
                  {format(day, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Task Form */}
      {showForm && (
        <div className="w-full lg:w-1/3 p-4 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Add Task</h2>

          <label className="block mb-2 font-medium">Item Name</label>
          <select
            name="itemName"
            value={task.itemName}
            onChange={handleChange}
            className="w-full mb-4 p-2 border border-gray-300 rounded"
          >
            <option value="">Select Item</option>
            <option value="irrigation">Irrigation</option>
            <option value="weather">Weather</option>
            <option value="pest">Pest</option>
            <option value="alert">Alert</option>
          </select>

          <label className="block mb-2 font-medium">Task Description</label>
          <textarea
            name="description"
            value={task.description}
            onChange={handleChange}
            className="w-full mb-4 p-2 border border-gray-300 rounded"
            rows={3}
          />

          <label className="block mb-2 font-medium">Select Field Officer</label>
          {loadingFieldOfficers ? (
            <div className="w-full mb-4 p-2 border border-gray-300 rounded bg-gray-100 text-gray-500">
              Loading field officers...
            </div>
          ) : fieldOfficers.length > 0 ? (
            <select
              name="fieldOfficer"
              value={task.fieldOfficer}
              onChange={handleChange}
              className="w-full mb-4 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Field Officer</option>
              {fieldOfficers.map(officer => (
                <option key={officer.id} value={officer.username}>
                  {officer.name} ({officer.username})
                </option>
              ))}
            </select>
          ) : (
            <div className="w-full mb-4 p-2 border border-red-300 rounded bg-red-50 text-red-600">
              No field officers found under this manager
            </div>
          )}

          {/* <label className="block mb-2 font-medium">Select Team</label>
          <select
            name="team"
            value={task.team}
            onChange={handleChange}
            className="w-full mb-4 p-2 border border-gray-300 rounded"
          >
            <option value="">Select Team</option>
            <option value="irrigation">Irrigation</option>
            <option value="weather">Weather</option>
            <option value="growth">Growth</option>
            <option value="pest">Pest</option>
          </select> */}

          <label className="block mb-2 font-medium">Selected Date</label>
          <input
            type="text"
            value={selectedDate ? selectedDate.toDateString() : ''}
            disabled
            className="w-full mb-4 p-2 border border-gray-300 rounded bg-gray-100"
          />

          {/* <label className="block mb-2 font-medium">Message</label>
          <textarea
            name="message"
            value={task.message}
            onChange={handleChange}
            className="w-full mb-4 p-2 border border-gray-300 rounded"
            rows={2}
          /> */}

          <div className="flex justify-between gap-4">
            <button
              onClick={handleAssignTask}
              disabled={isSubmitting}
              className={`w-1/2 ${
                isSubmitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
              } text-white font-semibold py-2 px-4 rounded`}
            >
              {isSubmitting ? 'Assigning...' : 'Assign Task'}
            </button>
            <button
              onClick={handleCancel}
              className="px-6 py-3 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
