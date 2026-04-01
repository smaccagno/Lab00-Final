import { useEffect, useState } from 'react';
import styles from './UserComponent.module.css';

const API_URL = 'https://jsonplaceholder.typicode.com/users/1';

function UserComponent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    let cancelled = false;

    async function fetchUser() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setUser(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <p>No user data.</p>
      </div>
    );
  }

  return (
    <div
      className={`${styles.container} ${
        theme === 'dark' ? styles.darkTheme : styles.lightTheme
      }`}
      data-theme={theme}
    >
      <h2>User Profile</h2>
      <p>Name: {user.name}</p>
      <p>Email: {user.email}</p>
      <p>Phone: {user.phone}</p>
      <p>Website: {user.website}</p>
      <button onClick={toggleTheme}>Switch Theme</button>
    </div>
  );
}

export default UserComponent;
