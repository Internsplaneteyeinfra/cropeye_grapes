import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface AgricultureData {
  id: number;
  crop: string;
  region: string;
  yield: number;

}

const AgricultureData: React.FC = () => {
  const [data, setData] = useState<AgricultureData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const API_KEY = 'api_live_oU8aXavWgShH3rMTYxkKRsA7J5mhzPnBzqxo6RikhJp4ycKG3cYFuGraJMQ';
  const API_URL = 'https://api.apitube.io//v1/news/everything';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get<AgricultureData[]>(API_URL, {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
          },
        });
        setData(response.data);
      } catch (err) {
        setError('Failed to fetch agriculture data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading agriculture data...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div>
      <h2>Agriculture Data</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Crop</th>
            <th>Region</th>
            <th>Yield</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.crop}</td>
              <td>{item.region}</td>
              <td>{item.yield}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AgricultureData;
