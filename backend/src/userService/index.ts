import { app, port } from './app.js';

app.listen(port, () => {
  console.log(`User service running on http://localhost:${port}`);
});