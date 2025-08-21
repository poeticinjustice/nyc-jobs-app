# NYC Jobs - MERN Stack Application

Created by Ramzi using Cursor, largely to test its AI capabilities

A comprehensive job search and management application for NYC government job postings, built with the MERN stack (MongoDB, Express.js, React, Node.js) and Redux Toolkit. This application provides fast, efficient search through all NYC government job postings with advanced filtering, user authentication, and job management features.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_ACTUAL_USERNAME/YOUR_REPOSITORY_NAME.git
cd YOUR_REPOSITORY_NAME

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

## Features

### 🔍 Job Search & Management

- **Complete NYC Jobs Dataset** - Search through ALL NYC government job postings (50,000+ jobs)
- **Smart API Search** - Uses NYC API's native search capabilities for lightning-fast results
- **Advanced Filtering** - Filter by category, location, salary range, and keywords
- **Intelligent Caching** - 5-minute cache system for optimal performance
- **Save and Unsave** - Bookmark jobs for later review
- **Detailed Job Views** - Complete job information with descriptions and requirements
- **Pagination** - Navigate through large result sets efficiently
- **Real-time Updates** - Immediate UI feedback when saving/unsaving jobs

### 👤 User Authentication & Authorization

- User registration and login
- JWT-based authentication
- Role-based access control (User, Admin, Moderator)
- Profile management
- Password change functionality

### 📝 Notes System

- Create and edit notes for saved job listings
- Categorize notes by type (general, interview, application, followup, research)
- Set priority levels (low, medium, high, urgent)
- Add tags and attachments
- Private/public note visibility

### 🎨 Modern UI/UX

- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile
- **Tailwind CSS** - Modern utility-first styling
- **Loading States** - Smooth loading indicators and skeleton screens
- **Error Handling** - Graceful error messages and recovery
- **Real-time Feedback** - Toast notifications for user actions
- **Accessible** - Keyboard navigation and screen reader support

### 🔧 Admin Features

- User management dashboard
- View user statistics
- Manage user roles and permissions
- System analytics

## Tech Stack

### Backend

- **Node.js** - Runtime environment
- **Express.js** - Web framework with optimized routing
- **MongoDB Atlas** - Cloud database with automatic scaling
- **Mongoose** - ODM with advanced indexing
- **JWT** - Secure authentication tokens
- **bcryptjs** - Password hashing and verification
- **express-validator** - Comprehensive input validation
- **helmet** - Security headers and protection
- **cors** - Cross-origin resource sharing
- **axios** - HTTP client with timeout protection
- **express-rate-limit** - Rate limiting for API protection

### Frontend

- **React 18** - Modern UI library with hooks
- **Redux Toolkit** - Efficient state management with RTK Query
- **React Router v6** - Client-side routing with protected routes
- **Tailwind CSS** - Utility-first CSS framework
- **React Hook Form** - Performant form handling
- **React Hot Toast** - Beautiful toast notifications
- **React Icons** - Comprehensive icon library
- **Axios** - Promise-based HTTP client

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **MongoDB Atlas** account (recommended) or local MongoDB
- **Git** for version control

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/nyc-jobs-app.git
cd nyc-jobs-app
```

### 2. Install dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
npm run install-client
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the `.env` file with your configuration:

```env
# MongoDB Connection (Replace with your MongoDB Atlas URI)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# JWT Secret (Generate a strong secret for production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=8000
NODE_ENV=development

# NYC Jobs API
NYC_JOBS_API_URL=https://data.cityofnewyork.us/resource/kpav-sd4t.json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**⚠️ Important**: Replace the MongoDB URI with your own connection string. Never commit sensitive credentials to version control.

### 4. Start the application

#### Development mode (both server and client)

```bash
npm run dev
```

This will start both the backend server (port 8000) and frontend development server (port 3000).

#### Production mode

```bash
# Build the client
npm run build

# Start the server
npm start
```

#### Individual services

```bash
# Start only the backend server
npm run server

# Start only the frontend client
npm run client
```

The application will be available at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Health Check**: http://localhost:8000/api/jobs/health

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/password` - Change password

### Jobs

- `GET /api/jobs/search` - Search jobs with filtering, pagination, and smart caching
- `GET /api/jobs/:id` - Get detailed job information
- `POST /api/jobs/:id/save` - Save job to user's list
- `DELETE /api/jobs/:id/save` - Remove job from saved list
- `GET /api/jobs/saved` - Get user's saved jobs with pagination
- `GET /api/jobs/categories` - Get all available job categories
- `GET /api/jobs/health` - API health check, cache status, and search cache info
- `GET /api/jobs/nyc-api-health` - NYC Jobs API health check

### Notes

- `POST /api/notes` - Create note for a job
- `GET /api/notes` - Get user's notes
- `GET /api/notes/:id` - Get specific note by ID
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
- `GET /api/notes/job/:jobId` - Get all notes for a specific job
- `GET /api/notes/stats` - Get note statistics

### Users (Admin)

- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID (admin only)
- `PUT /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)
- `GET /api/users/stats` - Get user statistics (admin only)

## Project Structure

```
NYCJobs/
├── server/
│   ├── index.js              # Server entry point with rate limiting and health checks
│   ├── models/               # Database models
│   │   ├── User.js
│   │   ├── Job.js
│   │   └── Note.js
│   ├── routes/               # API routes
│   │   ├── auth.js
│   │   ├── jobs.js           # Smart search with caching and deduplication
│   │   ├── notes.js
│   │   └── users.js
│   └── middleware/           # Custom middleware
│       └── auth.js
├── client/
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── Auth/
│   │   │   ├── Layout/       # Clean header without notifications
│   │   │   └── UI/
│   │   ├── pages/           # Page components
│   │   │   └── JobSearch.js  # URL persistence and mobile-optimized
│   │   ├── store/           # Redux store
│   │   │   └── slices/      # Redux slices
│   │   ├── utils/           # Utility functions
│   │   │   └── textUtils.js # UTF-8 text cleaning
│   │   └── App.js
│   ├── package.json
│   └── tailwind.config.js
├── package.json
├── render.yaml               # Render deployment configuration
└── README.md
```

## Database Schema

### User Model

- Email, password, first name, last name
- Role (user, admin, moderator)
- Active status, last login
- Saved jobs reference

### Job Model

- NYC API job data
- Saved by users tracking
- View count and analytics
- Search indexing

### Note Model

- User and job references
- Title, content, type, priority
- Tags and attachments
- Privacy settings

## Performance & Security Features

### Performance

- **Smart Caching** - 5-minute cache for NYC API responses
- **API Optimization** - Uses NYC API's native search capabilities
- **Batch Processing** - Efficient handling of large datasets
- **Timeout Protection** - 30-second timeouts prevent hanging requests
- **Pagination** - Efficient handling of large result sets

### Security

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt with salt rounds
- **Input Validation** - Comprehensive validation with express-validator
- **Rate Limiting** - API protection against abuse
- **CORS Configuration** - Secure cross-origin requests
- **Helmet Headers** - Security headers and protection
- **Role-based Access** - User, Admin, and Moderator roles
- **Trust Proxy** - Secure proxy configuration for production

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Deployment

### Heroku Deployment

1. **Create Heroku App**:

   ```bash
   heroku create your-app-name
   ```

2. **Set Environment Variables**:

   ```bash
   heroku config:set MONGODB_URI=your_mongodb_uri
   heroku config:set JWT_SECRET=your_jwt_secret
   heroku config:set NODE_ENV=production
   ```

3. **Deploy**:
   ```bash
   git push heroku main
   ```

### Vercel Deployment

1. **Connect Repository** to Vercel
2. **Set Environment Variables** in Vercel dashboard
3. **Deploy** automatically on push

### Docker Deployment

```bash
# Build image
docker build -t nyc-jobs-app .

# Run container
docker run -p 8000:8000 -e MONGODB_URI=your_uri nyc-jobs-app
```

---

**Note**: This application uses the NYC Jobs API for job data. Please ensure compliance with the API's terms of service and rate limits. The application implements intelligent caching and rate limiting to respect API constraints.
