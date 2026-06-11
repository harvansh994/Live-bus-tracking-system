PHP backend for the live bus tracking system.

Files:
- index.php: API router
- config.php: database credentials
- db.php: PDO connection helper
- .htaccess: Apache rewrite rules
- schema.sql: MySQL schema and demo data

Upload all files to your PHP server folder.
Then import schema.sql into MySQL.
Update config.php with your database details.

API endpoints:
- GET /health
- POST /api/driver/login
- POST /api/driver/location
- GET /api/public/buses
- GET /api/public/buses/{busCode}
- GET /api/admin/buses
- GET /api/admin/buses/{id}
- POST /api/admin/buses
- POST /api/admin/buses/{id}/stops
- DELETE /api/admin/stops/{id}
