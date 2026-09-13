export default function handler(req, res) {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Fov.it API is running',
    endpoints: ['/api/register', '/api/login', '/api/scripts', '/api/get']
  });
}
