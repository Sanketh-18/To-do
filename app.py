"""
To-Do List Flask Backend
RESTful API with SQLite database for task management
"""

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from frontend

# Database path
DATABASE = os.path.join(os.path.dirname(__file__), 'database.db')

# ─────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────

def get_db():
    """Open a new database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # Return rows as dict-like objects
    return conn


def init_db():
    """Create the tasks table if it doesn't exist."""
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL,
                description TEXT    DEFAULT '',
                status      INTEGER DEFAULT 0,       -- 0 = pending, 1 = completed
                priority    TEXT    DEFAULT 'medium', -- low / medium / high
                due_date    TEXT    DEFAULT NULL,
                created_at  TEXT    DEFAULT (datetime('now'))
            )
        ''')
        conn.commit()


def row_to_dict(row):
    """Convert a sqlite3.Row to a plain Python dict."""
    d = dict(row)
    d['status'] = bool(d['status'])  # Convert 0/1 to True/False
    return d


# ─────────────────────────────────────────
# Routes
# ─────────────────────────────────────────

@app.route('/')
def index():
    """Serve the main HTML page."""
    return render_template('index.html')


@app.route('/tasks', methods=['GET'])
def get_tasks():
    """
    GET /tasks
    Returns all tasks ordered by creation date (newest first).
    Optional query params:
      - status: 'completed' | 'pending'
      - search: search term for title
    """
    status_filter = request.args.get('status')     # 'completed' | 'pending'
    search_query  = request.args.get('search', '').strip()

    sql    = 'SELECT * FROM tasks WHERE 1=1'
    params = []

    if status_filter == 'completed':
        sql += ' AND status = 1'
    elif status_filter == 'pending':
        sql += ' AND status = 0'

    if search_query:
        sql += ' AND title LIKE ?'
        params.append(f'%{search_query}%')

    sql += ' ORDER BY created_at DESC'

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    return jsonify([row_to_dict(r) for r in rows]), 200


@app.route('/tasks', methods=['POST'])
def create_task():
    """
    POST /tasks
    Body JSON: { title, description, priority, due_date }
    Returns the newly created task.
    """
    data = request.get_json(silent=True)

    if not data or not data.get('title', '').strip():
        return jsonify({'error': 'Title is required'}), 400

    title       = data['title'].strip()
    description = data.get('description', '').strip()
    priority    = data.get('priority', 'medium').lower()
    due_date    = data.get('due_date') or None

    if priority not in ('low', 'medium', 'high'):
        priority = 'medium'

    with get_db() as conn:
        cursor = conn.execute(
            'INSERT INTO tasks (title, description, priority, due_date) VALUES (?, ?, ?, ?)',
            (title, description, priority, due_date)
        )
        conn.commit()
        new_task = conn.execute('SELECT * FROM tasks WHERE id = ?', (cursor.lastrowid,)).fetchone()

    return jsonify(row_to_dict(new_task)), 201


@app.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """
    PUT /tasks/<id>
    Body JSON: { title, description, priority, due_date }
    Returns the updated task.
    """
    data = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Fetch existing task first
    with get_db() as conn:
        existing = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()

    if not existing:
        return jsonify({'error': 'Task not found'}), 404

    title       = data.get('title', existing['title']).strip() or existing['title']
    description = data.get('description', existing['description'])
    priority    = data.get('priority', existing['priority']).lower()
    due_date    = data.get('due_date', existing['due_date']) or None

    if priority not in ('low', 'medium', 'high'):
        priority = existing['priority']

    with get_db() as conn:
        conn.execute(
            'UPDATE tasks SET title=?, description=?, priority=?, due_date=? WHERE id=?',
            (title, description, priority, due_date, task_id)
        )
        conn.commit()
        updated = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()

    return jsonify(row_to_dict(updated)), 200


@app.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """
    DELETE /tasks/<id>
    Permanently removes a task.
    """
    with get_db() as conn:
        existing = conn.execute('SELECT id FROM tasks WHERE id = ?', (task_id,)).fetchone()

        if not existing:
            return jsonify({'error': 'Task not found'}), 404

        conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        conn.commit()

    return jsonify({'message': f'Task {task_id} deleted successfully'}), 200


@app.route('/tasks/<int:task_id>/toggle', methods=['PATCH'])
def toggle_task(task_id):
    """
    PATCH /tasks/<id>/toggle
    Flips the completion status of a task.
    """
    with get_db() as conn:
        existing = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()

        if not existing:
            return jsonify({'error': 'Task not found'}), 404

        new_status = 0 if existing['status'] else 1
        conn.execute('UPDATE tasks SET status=? WHERE id=?', (new_status, task_id))
        conn.commit()
        updated = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()

    return jsonify(row_to_dict(updated)), 200


# ─────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print("✅ Database initialised")
    print("🚀 Starting Flask server on http://localhost:5001")
    app.run(debug=True, host='0.0.0.0', port=5001)
