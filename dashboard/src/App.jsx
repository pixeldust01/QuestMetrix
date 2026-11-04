import { useEffect, useState } from "react";
import { aggregateEventsByDate } from "./eventsOverTime";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const API_BASE_URL = "http://127.0.0.1:8000";
const WS_URL = "ws://127.0.0.1:8000/ws/events";
const LEVELS_GAME_ID =
  import.meta.env.VITE_ANALYTICS_GAME_ID || "mock_analytics_game";

function App() {
  const [events, setEvents] = useState([]);
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [levels, setLevels] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  const refreshAnalytics = async () => {
    const [gamesResponse, playersResponse, levelsResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/games`),
      fetch(`${API_BASE_URL}/players`),
      fetch(
        `${API_BASE_URL}/levels?game_id=${encodeURIComponent(LEVELS_GAME_ID)}`,
      ),
    ]);

    if (!gamesResponse.ok || !playersResponse.ok || !levelsResponse.ok) {
      throw new Error("Failed to refresh dashboard analytics");
    }

    const [gamesData, playersData, levelsData] = await Promise.all([
      gamesResponse.json(),
      playersResponse.json(),
      levelsResponse.json(),
    ]);

    setGames(gamesData);
    setPlayers(playersData);
    setLevels(levelsData);
  };

  const eventsOverTime = aggregateEventsByDate(events);

  useEffect(() => {
    fetch(`${API_BASE_URL}/events`)
      .then(async (eventsResponse) => {
        if (!eventsResponse.ok) {
          throw new Error("Failed to fetch dashboard events");
        }

        setEvents(await eventsResponse.json());
        await refreshAnalytics();
        setLoading(false);
      })
      .catch((error) => {
        setError(error.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    let analyticsRefreshTimer;

    socket.onopen = () => {
      console.log("Connected to QuestMetrix WebSocket");
      setConnectionStatus("Connected");
    };

    socket.onmessage = (message) => {
      try {
        const eventData = JSON.parse(message.data);

        console.log("New event received:", eventData);

        setEvents((previousEvents) => [
          {
            ...eventData,
            id: `live-${Date.now()}-${Math.random()}`,
          },
          ...previousEvents,
        ]);

        clearTimeout(analyticsRefreshTimer);
        analyticsRefreshTimer = setTimeout(() => {
          refreshAnalytics().catch((error) => {
            setError(error.message);
          });
        }, 500);
      } catch (error) {
        console.error("Failed to process WebSocket event:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("Error");
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setConnectionStatus("Disconnected");
    };

    return () => {
      clearTimeout(analyticsRefreshTimer);
      socket.close();
    };
  }, []);

  return (
    <div>
      <h1>QuestMetrix</h1>
      <p>WebSocket Status: {connectionStatus}</p>
      <div className="summary-cards">
        <div className="card">
          <h3>Total Events</h3>
          <p>{events.length}</p>
        </div>

        <div className="card">
          <h3>Unique Players</h3>
          <p>{players.length}</p>
        </div>

        <div className="card">
          <h3>Unique Games</h3>
          <p>{games.length}</p>
        </div>
      </div>

      <h2>Events Over Time</h2>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={eventsOverTime}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="events" stroke="#333" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h2>Level Completion Rates</h2>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={levels}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="level"
              label={{
                value: "Level",
                position: "insideBottom",
                offset: -5,
              }}
            />
            <YAxis
              domain={[0, 100]}
              label={{
                value: "Completion %",
                angle: -90,
                position: "insideLeft",
              }}
            />
            <Tooltip />
            <Bar dataKey="completion_rate" fill="#555" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2>Raw Events</h2>

      {loading && <p>Loading QuestMetrix analytics...</p>}

      {error && (
        <div className="error-message">
          <h2>Unable to load dashboard</h2>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Event</th>
              <th>Player</th>
              <th>Game</th>
              <th>Level</th>
              <th>Timestamp</th>
            </tr>
          </thead>

          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.id}</td>
                <td>{event.event}</td>
                <td>{event.player_id}</td>
                <td>{event.game_id}</td>
                <td>{event.level}</td>
                <td>{event.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;
