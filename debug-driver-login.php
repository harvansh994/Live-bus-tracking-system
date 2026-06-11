<?php

declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

function debugResponse(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function issueDebugToken(PDO $pdo, int $busId, string $busCode): string
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 7 * 24 * 60 * 60);

    $deleteStmt = $pdo->prepare('DELETE FROM driver_sessions WHERE bus_id = :bus_id');
    $deleteStmt->execute(['bus_id' => $busId]);

    $insertStmt = $pdo->prepare(
        'INSERT INTO driver_sessions (bus_id, bus_code, token, expires_at, created_at)
         VALUES (:bus_id, :bus_code, :token, :expires_at, UTC_TIMESTAMP())'
    );
    $insertStmt->execute([
        'bus_id' => $busId,
        'bus_code' => $busCode,
        'token' => $token,
        'expires_at' => $expiresAt,
    ]);

    return $token;
}

try {
    $pdo = getDatabaseConnection($config);

    $busCode = trim((string) ($_GET['busCode'] ?? 'DEMO-101'));
    $pin = trim((string) ($_GET['pin'] ?? '1234'));

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
        debugResponse([
            'ok' => false,
            'stage' => 'lookup',
            'message' => 'Invalid bus code or PIN',
            'busCode' => $busCode,
        ], 401);
    }

    $token = issueDebugToken($pdo, (int) $bus['id'], (string) $bus['bus_code']);

    debugResponse([
        'ok' => true,
        'stage' => 'login',
        'message' => 'Driver login path works',
        'tokenPreview' => substr($token, 0, 12) . '...',
        'bus' => [
            'id' => (int) $bus['id'],
            'busCode' => (string) $bus['bus_code'],
            'routeName' => (string) $bus['route_name'],
        ],
    ]);
} catch (Throwable $error) {
    debugResponse([
        'ok' => false,
        'stage' => 'exception',
        'errorClass' => get_class($error),
        'message' => $error->getMessage(),
        'file' => basename($error->getFile()),
        'line' => $error->getLine(),
    ], 500);
}
