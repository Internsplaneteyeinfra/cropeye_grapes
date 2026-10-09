import React, { useState, useEffect } from 'react';
import { AddStock } from './AddStock'; // Assuming AddStock is in the same folder
import { getstock } from '../api';

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

const ParentComponent: React.FC = () => {
  const [stocks, setStocks] = useState<InventoryItem[]>([]); // State to hold stocks data
  const [showForm, setShowForm] = useState(false); // State to control showing the form

  useEffect(() => {
    getstock()
      .then(({ data }) => {
        const records = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.stocks)
              ? data.stocks
              : [];
        setStocks(records.map((stock: any) => ({
          id: stock.id,
          itemName: stock.item_name || stock.itemName || '',
          Make: stock.make || stock.Make || '',
          itemType: stock.item_type || stock.itemType || 'Logistic',
          yearMake: String(stock.year_of_make || stock.yearMake || ''),
          estimateCost: String(stock.estimate_cost || stock.estimateCost || ''),
          status: stock.status || 'Working',
          remark: stock.remark || '',
        })));
      })
      .catch(error => {
        console.error('Error fetching Railway stock data:', error);
        setStocks([]);
      });
  }, []);

  return (
    <div>
      <AddStock
        showForm={showForm}
        setShowForm={setShowForm}
        setStocks={setStocks} // Pass setStocks function down to the AddStock component
      />

      {/* Display the list of stocks */}
      <div>
        <h3>Stocks:</h3>
        <ul>
          {stocks.map(stock => (
            <li key={stock.id}>{stock.itemName} - {stock.status}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ParentComponent;
