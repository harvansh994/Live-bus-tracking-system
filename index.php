<?php

declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

function jsonResponse(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function getBearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('getallheaders')) {
        $headers = getallheaders();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (preg_match('/Bearer\s+(.*)$/i', $header, $matches)) {
        return trim($matches[1]);
    }

    return null;
}

function issueDriverToken(PDO $pdo, int $busId, string $busCode): string
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 7 * 24 * 60 * 60);

    $deleteStmt = $pdo->prepare('DELETE FROM driver_sessions WHERE bus_id = :bus_id');
    $deleteStmt->execute(['bus_id' => $busId]);

    $insertStmt = $pdo->prepare(
        'INSERT INTO driver_sessions (bus_id, bus_code, token, expires_at, created_at) VALUES (:bus_id, :bus_code, :token, :expires_at, UTC_TIMESTAMP())'
    );
    $insertStmt->execute([
        'bus_id' => $busId,
        'bus_code' => $busCode,
        'token' => $token,
        'expires_at' => $expiresAt,
    ]);

    return $token;
}

function requireDriver(PDO $pdo): array
{
    $token = getBearerToken();
    if (!$token) {
        jsonResponse(['message' => 'Missing bearer token'], 401);
    }

    $stmt = $pdo->prepare(
        'SELECT bus_id AS busId, bus_code AS busCode, expires_at AS expiresAt
         FROM driver_sessions
         WHERE token = :token
         LIMIT 1'
    );
    $stmt->execute(['token' => $token]);
    $session = $stmt->fetch();

    if (!$session || strtotime((string) $session['expiresAt']) < time()) {
        jsonResponse(['message' => 'Invalid or expired token'], 401);
    }

    return $session;
}

function getBusStops(PDO $pdo, int $busId): array
{
    $stmt = $pdo->prepare(
        'SELECT
            id,
            stop_code AS stopCode,
            stop_name AS stopName,
            latitude,
            longitude,
            stop_order AS stopOrder
         FROM route_stops
         WHERE bus_id = :bus_id
         ORDER BY stop_order ASC'
    );
    $stmt->execute(['bus_id' => $busId]);
    $stops = $stmt->fetchAll();
    return array_map('normalizeStopRow', $stops);
}

function getPublicBuses(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT
            id,
            bus_code AS busCode,
            route_name AS routeName,
            last_latitude AS latitude,
            last_longitude AS longitude,
            last_speed AS speed,
            last_heading AS heading,
            last_updated_at AS updatedAt,
            status
         FROM buses
         ORDER BY bus_code ASC'
    );
    $buses = $stmt->fetchAll();
    return array_map('normalizeBusRow', $buses);
}

function getAdminBuses(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT
            id,
            bus_code AS busCode,
            route_name AS routeName,
            driver_pin AS driverPin,
            last_latitude AS latitude,
            last_longitude AS longitude,
            last_speed AS speed,
            last_heading AS heading,
            last_updated_at AS updatedAt,
            status
         FROM buses
         ORDER BY bus_code ASC'
    );
    $buses = $stmt->fetchAll();
    return array_map('normalizeBusRow', $buses);
}

function getPublicBusDetail(PDO $pdo, string $busCode): ?array
{
    $stmt = $pdo->prepare(
        'SELECT
            id,
            bus_code AS busCode,
            route_name AS routeName,
            last_latitude AS latitude,
            last_longitude AS longitude,
            last_speed AS speed,
            last_heading AS heading,
            last_updated_at AS updatedAt,
            status
         FROM buses
         WHERE bus_code = :bus_code
         LIMIT 1'
    );
    $stmt->execute(['bus_code' => $busCode]);
    $bus = $stmt->fetch();

    if (!$bus) {
        return null;
    }

    $bus = normalizeBusRow($bus);
    $bus['stops'] = getBusStops($pdo, (int) $bus['id']);
    return $bus;
}

function getAdminBusDetail(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT
            id,
            bus_code AS busCode,
            route_name AS routeName,
            driver_pin AS driverPin,
            last_latitude AS latitude,
            last_longitude AS longitude,
            last_speed AS speed,
            last_heading AS heading,
            last_updated_at AS updatedAt,
            status
         FROM buses
         WHERE id = :id
         LIMIT 1'
    );
    $stmt->execute(['id' => $id]);
    $bus = $stmt->fetch();

    if (!$bus) {
        return null;
    }

    $bus = normalizeBusRow($bus);
    $bus['stops'] = getBusStops($pdo, (int) $bus['id']);
    return $bus;
}

function normalizeApiDate(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    $timestamp = strtotime($value . ' UTC');
    if ($timestamp === false) {
        $timestamp = strtotime($value);
    }

    return $timestamp === false ? $value : gmdate('c', $timestamp);
}

function normalizeBusRow(array $bus): array
{
    $bus['id'] = (int) $bus['id'];
    $bus['latitude'] = isset($bus['latitude']) ? (float) $bus['latitude'] : null;
    $bus['longitude'] = isset($bus['longitude']) ? (float) $bus['longitude'] : null;
    $bus['speed'] = isset($bus['speed']) ? (float) $bus['speed'] : 0.0;
    $bus['heading'] = isset($bus['heading']) ? (float) $bus['heading'] : 0.0;
    if (array_key_exists('updatedAt', $bus)) {
        $bus['updatedAt'] = normalizeApiDate($bus['updatedAt'] !== null ? (string) $bus['updatedAt'] : null);
    }
    return $bus;
}

function normalizeStopRow(array $stop): array
{
    $stop['id'] = (int) $stop['id'];
    $stop['latitude'] = (float) $stop['latitude'];
    $stop['longitude'] = (float) $stop['longitude'];
    $stop['stopOrder'] = (int) $stop['stopOrder'];
    return $stop;
}

function routePath(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

    if ($scriptDir && $scriptDir !== '/' && str_starts_with($path, $scriptDir)) {
        $path = substr($path, strlen($scriptDir));
    }

    return $path === '' ? '/' : $path;
}

$pdo = getDatabaseConnection($config);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = routePath();
$body = readJsonBody();

if ($method === 'GET' && $path === '/health') {
    jsonResponse([
        'status' => 'ok',
        'service' => 'live-bus-tracking-php-backend',
        'time' => gmdate('c'),
    ]);
}

if ($method === 'POST' && $path === '/api/driver/login') {
    try {
        $busCode = trim((string) ($body['busCode'] ?? ''));
        $pin = trim((string) ($body['pin'] ?? ''));

        if ($busCode === '' || $pin === '') {
            jsonResponse(['message' => 'busCode and pin are required'], 400);
        }

        $stmt = $pdo->prepare(
            'SELECT id, bus_code, route_name
             FROM buses
             WHERE bus_code = :bus_code AND driver_pin = :driver_pin
             LIMIT 1'
        );
        $stmt->execute([
            'bus_code' => $busCode,
            'driver_pin' => $pin,
        ]);
        $bus = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$bus) {
            jsonResponse(['message' => 'Invalid bus code or PIN'], 401);
        }

        $token = issueDriverToken($pdo, (int) $bus['id'], (string) $bus['bus_code']);

        jsonResponse([
            'token' => $token,
            'bus' => [
                'id' => (int) $bus['id'],
                'busCode' => (string) $bus['bus_code'],
                'routeName' => (string) $bus['route_name'],
            ],
        ]);
    } catch (Throwable $error) {
        jsonResponse([
            'message' => 'Driver login failed',
            'error' => $error->getMessage(),
        ], 500);
    }
}

if ($method === 'POST' && $path === '/api/driver/location') {
    $driver = requireDriver($pdo);

    $latitude = $body['latitude'] ?? null;
    $longitude = $body['longitude'] ?? null;
    $speed = isset($body['speed']) ? (float) $body['speed'] : 0.0;
    $heading = isset($body['heading']) ? (float) $body['heading'] : 0.0;

    if (!is_numeric($latitude) || !is_numeric($longitude)) {
        jsonResponse(['message' => 'latitude and longitude must be numbers'], 400);
    }

    $recordedAt = gmdate('Y-m-d H:i:s');

    $updateStmt = $pdo->prepare(
        'UPDATE buses
         SET last_latitude = :latitude,
             last_longitude = :longitude,
             last_speed = :speed,
             last_heading = :heading,
             last_updated_at = :updated_at,
             status = :status
         WHERE id = :id'
    );
    $updateStmt->execute([
        'latitude' => (float) $latitude,
        'longitude' => (float) $longitude,
        'speed' => $speed,
        'heading' => $heading,
        'updated_at' => $recordedAt,
        'status' => 'live',
        'id' => (int) $driver['busId'],
    ]);

    $lastLogStmt = $pdo->prepare(
        'SELECT recorded_at AS recordedAt
         FROM location_logs
         WHERE bus_id = :bus_id
         ORDER BY recorded_at DESC
         LIMIT 1'
    );
    $lastLogStmt->execute(['bus_id' => (int) $driver['busId']]);
    $latestLog = $lastLogStmt->fetch();

    $shouldStoreMinuteLog = !$latestLog || (strtotime($recordedAt) - strtotime((string) $latestLog['recordedAt']) >= 60);

    if ($shouldStoreMinuteLog) {
        $insertLogStmt = $pdo->prepare(
            'INSERT INTO location_logs (bus_id, latitude, longitude, speed, heading, recorded_at)
             VALUES (:bus_id, :latitude, :longitude, :speed, :heading, :recorded_at)'
        );
        $insertLogStmt->execute([
            'bus_id' => (int) $driver['busId'],
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'speed' => $speed,
            'heading' => $heading,
            'recorded_at' => $recordedAt,
        ]);
    }

    $payload = getPublicBusDetail($pdo, (string) $driver['busCode']);
    jsonResponse([
        'success' => true,
        'bus' => $payload,
        'storedInHistory' => $shouldStoreMinuteLog,
    ]);
}

if ($method === 'GET' && $path === '/api/public/buses') {
    jsonResponse(['buses' => getPublicBuses($pdo)]);
}

if ($method === 'GET' && preg_match('#^/api/public/buses/([^/]+)$#', $path, $matches)) {
    $bus = getPublicBusDetail($pdo, urldecode($matches[1]));
    if (!$bus) {
        jsonResponse(['message' => 'Bus not found'], 404);
    }
    jsonResponse(['bus' => $bus]);
}

if ($method === 'GET' && $path === '/api/admin/buses') {
    jsonResponse(['buses' => getAdminBuses($pdo)]);
}

if ($method === 'GET' && preg_match('#^/api/admin/buses/(\d+)$#', $path, $matches)) {
    $bus = getAdminBusDetail($pdo, (int) $matches[1]);
    if (!$bus) {
        jsonResponse(['message' => 'Bus not found'], 404);
    }
    jsonResponse(['bus' => $bus]);
}

if ($method === 'POST' && $path === '/api/admin/buses') {
    $busCode = trim((string) ($body['busCode'] ?? ''));
    $routeName = trim((string) ($body['routeName'] ?? ''));
    $driverPin = trim((string) ($body['driverPin'] ?? ''));
    $latitude = isset($body['latitude']) ? (float) $body['latitude'] : null;
    $longitude = isset($body['longitude']) ? (float) $body['longitude'] : null;

    if ($busCode === '' || $routeName === '' || $driverPin === '') {
        jsonResponse(['message' => 'busCode, routeName and driverPin are required'], 400);
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO buses (
                bus_code, route_name, driver_pin, last_latitude, last_longitude,
                last_speed, last_heading, last_updated_at, status
             ) VALUES (
                :bus_code, :route_name, :driver_pin, :last_latitude, :last_longitude,
                :last_speed, :last_heading, :last_updated_at, :status
             )'
        );
        $stmt->execute([
            'bus_code' => $busCode,
            'route_name' => $routeName,
            'driver_pin' => $driverPin,
            'last_latitude' => $latitude,
            'last_longitude' => $longitude,
            'last_speed' => 0,
            'last_heading' => 0,
            'last_updated_at' => gmdate('Y-m-d H:i:s'),
            'status' => 'ready',
        ]);

        $bus = getAdminBusDetail($pdo, (int) $pdo->lastInsertId());
        jsonResponse(['bus' => $bus], 201);
    } catch (PDOException $error) {
        jsonResponse(['message' => 'Could not create bus. Bus code may already exist.'], 400);
    }
}

if ($method === 'POST' && preg_match('#^/api/admin/buses/(\d+)/quick-route$#', $path, $matches)) {
    $busId = (int) $matches[1];
    $routeName = trim((string) ($body['routeName'] ?? ''));
    $startName = trim((string) ($body['startName'] ?? ''));
    $endName = trim((string) ($body['endName'] ?? ''));
    $startLatitude = $body['startLatitude'] ?? null;
    $startLongitude = $body['startLongitude'] ?? null;
    $endLatitude = $body['endLatitude'] ?? null;
    $endLongitude = $body['endLongitude'] ?? null;

    if (
        $routeName === '' || $startName === '' || $endName === '' ||
        !is_numeric($startLatitude) || !is_numeric($startLongitude) ||
        !is_numeric($endLatitude) || !is_numeric($endLongitude)
    ) {
        jsonResponse(['message' => 'routeName, startName, endName, startLatitude, startLongitude, endLatitude and endLongitude are required'], 400);
    }

    $busStmt = $pdo->prepare('SELECT id, bus_code FROM buses WHERE id = :id LIMIT 1');
    $busStmt->execute(['id' => $busId]);
    $bus = $busStmt->fetch();

    if (!$bus) {
        jsonResponse(['message' => 'Bus not found'], 404);
    }

    $pdo->beginTransaction();

    try {
        $updateBusStmt = $pdo->prepare(
            'UPDATE buses
             SET route_name = :route_name,
                 last_latitude = :start_latitude,
                 last_longitude = :start_longitude,
                 last_updated_at = UTC_TIMESTAMP(),
                 status = :status
             WHERE id = :id'
        );
        $updateBusStmt->execute([
            'route_name' => $routeName,
            'start_latitude' => (float) $startLatitude,
            'start_longitude' => (float) $startLongitude,
            'status' => 'ready',
            'id' => $busId,
        ]);

        $deleteStopsStmt = $pdo->prepare('DELETE FROM route_stops WHERE bus_id = :bus_id');
        $deleteStopsStmt->execute(['bus_id' => $busId]);

        $insertStopStmt = $pdo->prepare(
            'INSERT INTO route_stops (bus_id, stop_code, stop_name, latitude, longitude, stop_order)
             VALUES (:bus_id, :stop_code, :stop_name, :latitude, :longitude, :stop_order)'
        );

        $busCode = (string) $bus['bus_code'];

        $insertStopStmt->execute([
            'bus_id' => $busId,
            'stop_code' => 'START-' . $busCode,
            'stop_name' => $startName,
            'latitude' => (float) $startLatitude,
            'longitude' => (float) $startLongitude,
            'stop_order' => 1,
        ]);

        $insertStopStmt->execute([
            'bus_id' => $busId,
            'stop_code' => 'END-' . $busCode,
            'stop_name' => $endName,
            'latitude' => (float) $endLatitude,
            'longitude' => (float) $endLongitude,
            'stop_order' => 2,
        ]);

        $pdo->commit();

        $updatedBus = getAdminBusDetail($pdo, $busId);
        jsonResponse(['bus' => $updatedBus], 201);
    } catch (Throwable $error) {
        $pdo->rollBack();
        jsonResponse([
            'message' => 'Could not save quick route',
            'error' => $error->getMessage(),
        ], 500);
    }
}

if ($method === 'POST' && preg_match('#^/api/admin/buses/(\d+)/stops$#', $path, $matches)) {
    $busId = (int) $matches[1];
    $stopCode = trim((string) ($body['stopCode'] ?? ''));
    $stopName = trim((string) ($body['stopName'] ?? ''));
    $latitude = $body['latitude'] ?? null;
    $longitude = $body['longitude'] ?? null;
    $stopOrder = $body['stopOrder'] ?? null;

    if ($stopCode === '' || $stopName === '' || !is_numeric($latitude) || !is_numeric($longitude) || !is_numeric($stopOrder)) {
        jsonResponse(['message' => 'stopCode, stopName, latitude, longitude and stopOrder are required'], 400);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO route_stops (bus_id, stop_code, stop_name, latitude, longitude, stop_order)
         VALUES (:bus_id, :stop_code, :stop_name, :latitude, :longitude, :stop_order)'
    );
    $stmt->execute([
        'bus_id' => $busId,
        'stop_code' => $stopCode,
        'stop_name' => $stopName,
        'latitude' => (float) $latitude,
        'longitude' => (float) $longitude,
        'stop_order' => (int) $stopOrder,
    ]);

    $bus = getAdminBusDetail($pdo, $busId);
    jsonResponse(['bus' => $bus], 201);
}

if ($method === 'DELETE' && preg_match('#^/api/admin/buses/(\d+)$#', $path, $matches)) {
    $busId = (int) $matches[1];

    $stmt = $pdo->prepare('SELECT id, bus_code AS busCode FROM buses WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $busId]);
    $bus = $stmt->fetch();

    if (!$bus) {
        jsonResponse(['message' => 'Bus not found'], 404);
    }

    $pdo->beginTransaction();

    try {
        $deleteSessionsStmt = $pdo->prepare('DELETE FROM driver_sessions WHERE bus_id = :bus_id');
        $deleteSessionsStmt->execute(['bus_id' => $busId]);

        $deleteLogsStmt = $pdo->prepare('DELETE FROM location_logs WHERE bus_id = :bus_id');
        $deleteLogsStmt->execute(['bus_id' => $busId]);

        $deleteStopsStmt = $pdo->prepare('DELETE FROM route_stops WHERE bus_id = :bus_id');
        $deleteStopsStmt->execute(['bus_id' => $busId]);

        $deleteBusStmt = $pdo->prepare('DELETE FROM buses WHERE id = :id');
        $deleteBusStmt->execute(['id' => $busId]);

        $pdo->commit();

        jsonResponse([
            'success' => true,
            'message' => 'Bus removed successfully',
            'busCode' => (string) $bus['busCode'],
        ]);
    } catch (Throwable $error) {
        $pdo->rollBack();
        jsonResponse([
            'message' => 'Could not remove bus',
            'error' => $error->getMessage(),
        ], 500);
    }
}
if ($method === 'DELETE' && preg_match('#^/api/admin/stops/(\d+)$#', $path, $matches)) {
    $stopId = (int) $matches[1];

    $stmt = $pdo->prepare('SELECT bus_id AS busId FROM route_stops WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $stopId]);
    $stop = $stmt->fetch();

    if (!$stop) {
        jsonResponse(['message' => 'Stop not found'], 404);
    }

    $deleteStmt = $pdo->prepare('DELETE FROM route_stops WHERE id = :id');
    $deleteStmt->execute(['id' => $stopId]);

    $bus = getAdminBusDetail($pdo, (int) $stop['busId']);
    jsonResponse(['bus' => $bus]);
}

jsonResponse(['message' => 'Endpoint not found'], 404);

