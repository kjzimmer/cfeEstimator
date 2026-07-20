import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp();
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`CFE Estimator API listening on port ${port}`);
});
