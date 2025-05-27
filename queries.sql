

CREATE TABLE sessions (
    session_id VARCHAR(255) PRIMARY KEY, -- Unique identifier for the session
    user_id INT,                         -- Optional: Links session to a user
    ip_address VARCHAR(45),              -- Stores the user's IP address (IPv4/IPv6)
    user_agent TEXT,                     -- Stores the user's browser/device info
    data TEXT,                           -- Serialized session data (e.g., JSON)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When the session was created
    expires_at TIMESTAMP,                -- When the session expires
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last activity timestamp
    FOREIGN KEY (user_id) REFERENCES users(user_id) -- Optional: Links to a users table
);