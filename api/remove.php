<?php
/**
 * Server-side proxy for the remove.bg API.
 *
 * The browser posts an image here (field name: "image"). This script forwards
 * it to api.remove.bg with your secret API key and returns the PNG result.
 *
 * Setup:
 *   1. Copy config.example.php -> config.php and set REMOVEBG_API_KEY.
 *   2. In assets/js/config.js set apiEndpoint to 'api/remove.php'.
 */
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

$configFile = __DIR__ . '/config.php';
$allowedOrigin = '*';
$apiKey = getenv('REMOVEBG_API_KEY') ?: '';

if (is_file($configFile)) {
    require $configFile;
    if (defined('REMOVEBG_API_KEY')) {
        $apiKey = REMOVEBG_API_KEY;
    }
    if (defined('REMOVEBG_ALLOWED_ORIGIN')) {
        $allowedOrigin = REMOVEBG_ALLOWED_ORIGIN;
    }
}

header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respondError(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    respondError(405, 'Only POST requests are allowed.');
}

if ($apiKey === '' || $apiKey === 'your_remove_bg_api_key_here') {
    respondError(503, 'No API key configured. Copy api/config.example.php to api/config.php and add your remove.bg key.');
}

if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    respondError(400, 'No image was uploaded (field name must be "image").');
}

$file = $_FILES['image'];
if ($file['size'] > 15 * 1024 * 1024) {
    respondError(413, 'Image is larger than 15 MB.');
}

$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/bmp' => 'bmp'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
if (!isset($allowed[$mime])) {
    respondError(415, 'Unsupported image type. Use JPG, PNG, WebP or BMP.');
}

$tmp = tempnam(sys_get_temp_dir(), 'rbg_');
if ($tmp === false) {
    respondError(500, 'Could not create a temporary file.');
}
move_uploaded_file($file['tmp_name'], $tmp);
$extension = $allowed[$mime];
$renamed = $tmp . '.' . $extension;
rename($tmp, $renamed);

$ch = curl_init('https://api.remove.bg/v1.0/removebg');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['X-API-Key: ' . $apiKey],
    CURLOPT_POSTFIELDS => [
        'image_file' => new CURLFile($renamed, $mime, 'image.' . $extension),
        'size' => 'auto',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);
@unlink($renamed);

if ($response === false) {
    respondError(502, 'Could not reach the background removal service: ' . $error);
}
if ($status !== 200) {
    $body = json_decode($response, true);
    $message = $body['errors'][0]['title'] ?? 'Background removal failed (HTTP ' . $status . ').';
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}

header('Content-Type: image/png');
header('Cache-Control: no-store');
echo $response;
