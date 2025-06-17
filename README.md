# Consignment Store App

A modern web application for managing consignment stores with QR code access, user authentication, and admin approval workflow.

## Features

### User Features
- **QR Code Access**: Users can scan a QR code to access the store
- **One-Click Authentication**: Firebase Google Sign-in integration
- **Browse Items**: View available consignment items in an elegant grid layout
- **Add Items**: Upload multiple photos and descriptions for consignment
- **Item Status Tracking**: Track item approval status

### Admin Features
- **Item Approval Workflow**: Review and approve submitted items
- **3-Day Employee Preview**: Items are held for 3 days before going live
- **Firebase Admin Portal**: Manage all store operations

### Technical Features
- **React Frontend**: Modern React with TypeScript and Tailwind CSS
- **Firebase Backend**: Authentication, Firestore, and Storage
- **Python Server**: Flask backend for admin operations
- **Responsive Design**: Mobile-first responsive design
- **Image Upload**: Multiple image support with Firebase Storage

## Project Structure

```
src/
├── components/
│   ├── Home.tsx              # Main store interface
│   ├── ItemCard.tsx          # Individual item display
│   ├── AddItemModal.tsx      # Item submission form
│   └── ...
├── config/
│   └── firebase.ts          # Firebase configuration
├── hooks/
│   └── useAuth.ts           # Authentication hook
├── types/
│   └── index.ts             # TypeScript interfaces
└── ...

server/
├── firebase_config.py       # Firebase admin configuration
├── firebase_init.py         # Firebase initialization
└── main.py                  # Flask server
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd consignment-store
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**
   - Firebase configuration is already set up in `src/config/firebase.ts`
   - Ensure your Firebase project has Authentication, Firestore, and Storage enabled

4. **Configure Firebase Admin (Server)**
   - Create a `.env` file in the server directory with your Firebase Admin SDK credentials
   - Add your Firebase Admin SDK private key and other required fields

## Usage

### Development

**Start the frontend:**
```bash
npm run dev
```

**Start the backend server:**
```bash
npm run start:server
```

**Start both simultaneously:**
```bash
npm run dev:all
```

### User Workflow

1. **Access**: Scan QR code or visit the web URL
2. **Authentication**: Sign in with Google
3. **Browse**: View available items in the store
4. **Add Item**: Click "Add Item" to submit new items
5. **Upload**: Add photos, description, and price
6. **Wait**: Items are reviewed by admin before going live

### Admin Workflow

1. **Review**: Access Firebase console to review pending items
2. **Approve**: Change item status from "pending" to "approved"
3. **Employee Preview**: Items remain in "approved" status for 3 days
4. **Go Live**: Items automatically change to "live" status after 3 days

## Firebase Collections

### Items Collection
```typescript
{
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  status: 'pending' | 'approved' | 'live' | 'sold';
  createdAt: Date;
  approvedAt?: Date;
  liveAt?: Date;
}
```

## QR Code Integration

Generate QR codes that link to your deployed application URL. Users can scan these codes to access the store directly.

## Deployment

The app is ready for deployment to platforms like:
- **Frontend**: Vercel, Netlify, or Firebase Hosting
- **Backend**: Railway, Render, or Google Cloud Run

## Security Features

- Firebase Authentication with Google Sign-in
- Firestore Security Rules for data protection
- Image upload validation and size limits
- Admin role-based access control

## Technologies Used

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Python, Flask, Firebase Admin SDK
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **Authentication**: Firebase Auth
- **UI**: Tailwind CSS with custom components

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
