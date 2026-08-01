# NYC Jobs - MERN Stack Application

**Created by Ramzi using AI coding tools, largely to test their capabilities**

A job search and application-tracking app that aggregates postings from **25 NYC-area employers and job boards** into a single searchable database, built with the MERN stack (MongoDB, Express.js, React, Node.js) and Redux Toolkit. It provides fast search with advanced filtering, an interactive map, user authentication, saved-job application tracking, saved searches, a personal dashboard, and job-linked notes.

## 🚀 Quick Start

```bash
# Install dependencies
npm install
npm run install-client

# Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret

# Start development servers
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application!

## 📊 Job Sources

Jobs are aggregated from 25 sources (see `shared/constants/index.js` → `JOB_SOURCES`):

| Category | Sources |
| --- | --- |
| Government | NYC Open Data (city), NY State, USAJobs (federal), Port Authority, United Nations |
| Transit | MTA, Amtrak |
| Higher Ed | CUNY, NYU, Columbia, Fordham, The New School |
| Healthcare | Mount Sinai, NY-Presbyterian, Northwell, NYU Langone, Memorial Sloan Kettering, Montefiore, NYC Health + Hospitals |
| Culture & Non-Profit | AMNH, Met Museum, Frick Collection, Guggenheim, NYPL, Idealist (non-profit) |

**How data is refreshed:**

- A cron job in `server/index.js` (`node-cron`, every 6 hours: `0 0,6,12,18 * * *`) runs `server/scripts/refreshJobs.js`, which executes 24 API/HTML scrapers from `server/scrapers/` in parallel batches, upserts jobs, and cleans up stale postings (with safety thresholds so an API outage never purges a source).
- **MTA** is scraped daily by a browser-based GitHub Action (`.github/workflows/scrape-browser.yml`) running `server/scripts/scrapeWithBrowser.js` with Puppeteer + stealth plugin, because the MTA careers site requires JS rendering and blocks plain HTTP clients.
- On startup, if the database is empty, an initial seed is triggered automatically. You can also run a refresh manually with `npm run refresh-jobs`.

## ✨ Key Features

### 🔍 Job Search & Management

- **25 Aggregated Sources** - Search city, state, federal, transit, higher-ed, healthcare, and cultural-institution jobs in one place
- **Advanced Filtering** - Filter by source (including multi-source selection), category, agency, location, salary range, and keywords
- **Multiple Sort Options** - Sort by date (newest/oldest), title (A-Z/Z-A), salary (highest/lowest)
- **Results Per Page** - Choose between 20, 50, or 100 results per page
- **Pagination with URL State** - Search parameters and page state persist in the URL
- **Interactive Map** - Browse geocoded jobs on a Mapbox map with source/keyword/salary filters
- **Saved Searches** - Save filter combinations and re-run them later
- **Bookmarking & Application Tracking** - Save jobs and track application status (interested, applied, interviewing, offered, rejected) with status history, application/interview/follow-up dates, and document links
- **CSV Export** - Export saved jobs and notes as CSV

### 📝 Notes System

- **Job-Linked Notes** - Create notes tied to specific job postings
- **Note Categories** - general, interview, application, followup, research
- **Priority Levels** - low, medium, high, urgent
- **Filtering & Pagination** - Filter notes by type and priority, navigate large collections
- **Note Stats & Export** - Aggregate statistics and CSV export

### 📈 Personal Dashboard

- **Application Pipeline** - Saved jobs grouped by application status
- **Recent Activity** - Recently saved jobs and notes, saved-search count

### 👤 User Authentication & Management

- **JWT-based Authentication** - Secure token-based user sessions
- **Role-based Access Control** - `user`, `admin`, and `moderator` roles (see `shared/constants`)
- **Profile Management** - Update personal information
- **Password Security** - bcrypt hashing, secure password change

### 🔧 Administrative Features

- **User Management** - List, update, deactivate, and reactivate users; user statistics
- **Jobs Admin View** - Browse all jobs with save counts
- **Notes Admin View** - Browse notes across all users

## 🛠️ Tech Stack

### Backend

- **Node.js** (>= 18) + **Express.js**
- **MongoDB** with **Mongoose** ODM
- **node-cron** - Scheduled job refresh every 6 hours
- **cheerio** + **axios** - HTML/API scrapers for the job sources
- **JWT** (`jsonwebtoken`) + **bcryptjs** - Authentication
- **express-validator** - Input validation
- **helmet** - Security headers (CSP configured for Mapbox GL)
- **cors** - Cross-origin resource sharing
- **express-rate-limit** - General, auth-specific, and map-specific rate limiting

### Frontend

- **React 18** with **Redux Toolkit** and **React Router v6**
- **Tailwind CSS** (with typography plugin)
- **Mapbox GL JS** + **react-map-gl** - Job map
- **React Hot Toast** - Notifications
- **React Icons** - Icon library
- **DOMPurify** - Safe rendering of job descriptions
- **Axios** - HTTP client with auth interceptors

### Shared & Mobile

- **`shared/`** - `nyc-jobs-shared` package (constants, format/text/validation utils) used by both server and client
- **`apps/mobile`** - Expo (React Native) mobile app consuming the same API

## 📁 Monorepo Layout

```
NYCJobs/
├── server/                   # Express API
│   ├── index.js              # Entry point: env validation, Mongo connect, 6-hour refresh cron
│   ├── app.js                # Express app: helmet, rate limits, CORS, route mounts
│   ├── models/               # User, Job, Note, SavedSearch
│   ├── routes/               # auth, jobs, notes, searches, dashboard, users
│   ├── middleware/           # JWT auth, role checks, ObjectId validation
│   ├── scrapers/             # One module per job source (24 API/HTML scrapers)
│   ├── helpers/              # jobHelpers, geocoding, usaJobsApi
│   ├── scripts/              # refreshJobs.js (cron), scrapeWithBrowser.js (GitHub Action)
│   └── __tests__/            # Jest unit + integration tests
├── client/                   # React web app (Create React App)
│   └── src/
│       ├── components/       # Auth, Layout, Notes, UI
│       ├── pages/            # Home, JobSearch, JobDetails, JobMap, SavedJobs,
│       │                     # Notes, Profile, Admin, Sources, Login, Register
│       ├── store/            # Redux Toolkit slices
│       └── utils/            # api (axios interceptor), formatting helpers
├── shared/                   # nyc-jobs-shared package (npm-linked via file:../shared)
│   ├── constants/            # JOB_SOURCES, statuses, roles, validation limits
│   └── utils/                # formatUtils, textUtils, validation
├── apps/
│   └── mobile/               # Expo (React Native) app
├── .github/workflows/        # ci.yml, scrape-browser.yml
├── jest.config.js            # Server test config
├── render.yaml               # Render deployment configuration
└── package.json
```

The `shared/` package is consumed by the client via an npm file link (`"nyc-jobs-shared": "file:../shared"` in `client/package.json`) and by the server via relative requires.

## 📋 Prerequisites

- **Node.js** (v18 or higher, per `engines` in `package.json`)
- **npm**
- **MongoDB Atlas** account (recommended) or local MongoDB
- **Git** for version control

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
npm run install-client
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Required variables (the server exits if these are missing): `MONGODB_URI`, `JWT_SECRET`, `NYC_JOBS_API_URL`. Optional: `USAJOBS_API_KEY`, `USAJOBS_EMAIL`, `USAJOBS_BASE_URL` (federal jobs are skipped without them), `CORS_ORIGIN`, `PORT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`. See `.env.example` for details.

### 3. Start the Application

#### Development Mode (Recommended)

```bash
npm run dev
```

This starts both the backend server (port 8000) and frontend development server (port 3000).

#### Individual Services

```bash
# Start only the backend server
npm run server

# Start only the frontend client
npm run client
```

#### Production Mode

```bash
# Build the client
npm run build

# Start the server
npm start
```

## 🌐 Application Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Health Check**: http://localhost:8000/api/jobs/health

## 🔌 API Endpoints

### Health

- `GET /api/health` - Basic server health check
- `GET /api/jobs/health` - Health check with job count in database
- `GET /api/rate-limit-status` - Current rate-limit configuration

### Authentication (`/api/auth`)

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/password` - Change password

### Jobs (`/api/jobs`)

- `GET /api/jobs/search` - Search with filtering (`q`, `category`, `location`, `agency`, `salary_min`, `salary_max`, `source` — single or comma-separated multi-source), pagination (`page`, `limit`), and sorting (`sort`)
- `GET /api/jobs/map` - GeoJSON FeatureCollection of geocoded jobs (filters: `source`, `keyword`, `salary_min`, `salary_max`)
- `GET /api/jobs/categories` - All job categories (10-minute in-memory cache)
- `GET /api/jobs/agencies` - All agencies (10-minute in-memory cache)
- `GET /api/jobs/saved` - Get user's saved jobs with pagination
- `GET /api/jobs/saved/export` - Export saved jobs as CSV
- `GET /api/jobs/admin` - List all jobs with save counts (admin only)
- `GET /api/jobs/:id?source=<source>` - Job details; `source` query selects the source namespace (defaults to `nyc`)
- `POST /api/jobs/:id/save` - Save job to user's bookmarks
- `DELETE /api/jobs/:id/save` - Remove job from saved list
- `PUT /api/jobs/:id/status` - Set application status (interested, applied, interviewing, offered, rejected)
- `PUT /api/jobs/:id/tracking` - Update tracking data (application/interview/follow-up dates, document links, status history)

### Notes (`/api/notes`)

- `POST /api/notes` - Create note for a job
- `GET /api/notes` - Get user's notes with pagination and filtering
- `GET /api/notes/stats` - Note statistics
- `GET /api/notes/export` - Export notes as CSV
- `GET /api/notes/job/:jobId` - All notes for a specific job
- `GET /api/notes/admin` - List notes across all users (admin only)
- `GET /api/notes/:id` - Get note by ID
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### Saved Searches (`/api/searches`)

- `GET /api/searches` - Get user's saved searches
- `POST /api/searches` - Save a search
- `DELETE /api/searches/:id` - Delete a saved search

### Dashboard (`/api/dashboard`)

- `GET /api/dashboard` - Personalized dashboard: saved jobs by application status, recent saved jobs and notes, totals

### Users (`/api/users`)

- `GET /api/users` - Get all users (admin only)
- `GET /api/users/stats` - User statistics (admin only)
- `GET /api/users/:id` - Get user by ID (admin or self)
- `PUT /api/users/:id` - Update user (admin or self)
- `DELETE /api/users/:id` - Deactivate user (admin only)
- `POST /api/users/:id/reactivate` - Reactivate user (admin only)

## 🧪 Testing

Server tests use **Jest** + **supertest** with **mongodb-memory-server** (no real database needed):

```bash
npm run test:server            # Run all 249 server tests
npm run test:server:watch      # Watch mode
npm run test:server:coverage   # With coverage
npm run test:auth              # Single suite (also: test:jobs, test:notes,
                               # test:searches, test:dashboard, test:middleware, test:helpers)
```

Tests live in `server/__tests__/` (unit tests for helpers, middleware, and scraper transforms; integration tests for auth, jobs, notes, searches, dashboard, and users routes).

## 🤖 CI / GitHub Actions

- **`.github/workflows/ci.yml`** - On push/PR to `main`: installs dependencies, runs the server test suite, and builds the client on Node 20.x and 22.x.
- **`.github/workflows/scrape-browser.yml`** - Daily (6 AM UTC) browser-based scrape of sources that block plain HTTP clients (currently MTA), using Puppeteer with the stealth plugin. Supports manual dispatch with a comma-separated source list. Requires a `MONGODB_URI` repository secret.

## 🗺️ Map Page

The `/map` page (`client/src/pages/JobMap.js`) renders geocoded jobs as an interactive Mapbox map:

- Requires `REACT_APP_MAPBOX_TOKEN` in the environment at client build time (free token at [account.mapbox.com](https://account.mapbox.com/access-tokens/))
- Data comes from `GET /api/jobs/map`, which returns a GeoJSON FeatureCollection of jobs with coordinates (geocoded at scrape time via `server/helpers/geocoding.js`)
- The map endpoint has its own rate limit and a monthly request cap to stay within Mapbox free-tier limits
- Helmet's Content Security Policy is configured to allow Mapbox scripts, tiles, and telemetry

## 🗄️ Database Schema

### User Model

- Email, password (bcrypt-hashed), first name, last name
- Role (`user`, `admin`, `moderator`), active status, last login timestamp

### Job Model

- Normalized job data from all sources (`jobId`, `businessTitle`, `agency`, `description`, salary range, location, coordinates, etc.)
- `source` field identifying which of the 25 sources it came from
- `savedBy` entries per user with application status, status history, tracking dates, and document links
- `lastRefreshedAt` timestamp used for stale-job cleanup
- Text and field indexes for search

### Note Model

- User and job references
- Title, content, type (general/interview/application/followup/research), priority (low/medium/high/urgent), tags

### SavedSearch Model

- User reference, search name, and stored filter parameters

## ⚡ Performance & Security Features

### Performance

- **Database-backed search** - Jobs are scraped into MongoDB on a schedule, so searches never hit external APIs
- **Batched scraping** - Refresh runs scrapers in parallel batches of 5 with per-source failure isolation
- **Stale-job cleanup with safety thresholds** - A source is only purged when its scraper returned a meaningful number of jobs
- **TTL caching** - 10-minute in-memory cache for category/agency lookups
- **Pagination and URL state persistence** - Efficient handling of large result sets

### Security

- **JWT Authentication** with bcrypt password hashing
- **Input Validation** - express-validator on all write and search endpoints
- **Rate Limiting** - Global limiter, stricter limiter on auth routes, and dedicated map-endpoint limits
- **CORS Configuration** - `CORS_ORIGIN` allowlist in production, localhost in development
- **Helmet Headers** - CSP tuned for Mapbox GL
- **Role-based Access** - Admin-only routes enforced via `requireRole` middleware
- **Trust Proxy** - Secure proxy configuration for production (Render)

## 🚀 Deployment

### Render Deployment

The application includes a `render.yaml` file for deployment on Render:

1. Connect your GitHub repository to Render
2. Render will automatically detect the configuration
3. Set environment variables in the Render dashboard
4. Deploy

### Environment Variables for Production

```env
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_production_jwt_secret
NODE_ENV=production
NYC_JOBS_API_URL=https://data.cityofnewyork.us/resource/kpav-sd4t.json
USAJOBS_API_KEY=your_usajobs_key        # optional — federal jobs
USAJOBS_EMAIL=your_email                # optional — federal jobs
USAJOBS_BASE_URL=https://data.usajobs.gov/api/Search
CORS_ORIGIN=                            # comma-separated origins for cross-origin clients (e.g. mobile)
```

The MTA browser scraper runs in GitHub Actions (not on Render) and needs the `MONGODB_URI` secret configured in the repository settings.

## 📊 Data Sources

Job data comes from the [NYC Jobs dataset on NYC Open Data](https://data.cityofnewyork.us/resource/kpav-sd4t.json), the [USAJobs API](https://developer.usajobs.gov/), and public careers pages of the state, transit, higher-ed, healthcare, and cultural institutions listed above. Scrapers respect each source with scheduled (not per-request) fetching, timeouts, and failure isolation.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Note**: This application was created to test and demonstrate AI capabilities in software development. It showcases modern web development practices, comprehensive feature implementation, and robust architecture design.
