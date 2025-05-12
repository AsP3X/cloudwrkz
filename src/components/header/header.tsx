"use client";

import React from 'react';
import { useSession } from '../../hooks/useSession';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { isLoading, session, login, logout } = useSession();

  return (
    <header className="bg-gray-900 text-white py-4">
      <div className="container mx-auto flex items-center justify-between">
        <a href="/" className="text-2xl font-semibold">My Application</a>
        <nav className="flex items-center">
          <ul className="flex space-x-6 mr-4">
            <li><a href="/" className="hover:text-gray-300 transition duration-300">Home</a></li>
            <li><a href="/about" className="hover:text-gray-300 transition duration-300">About</a></li>
            <li><a href="/contact" className="hover:text-gray-300 transition duration-300">Contact</a></li>
          </ul>
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 hover:bg-gray-800 rounded-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1">
                {!isLoading && !session.active && (
                  <button 
                    onClick={() => login()} 
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Login
                  </button>
                )}
                {!isLoading && session.active && (
                  <>
                    <a href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Profile</a>
                    <a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Settings</a>
                    <button 
                      onClick={() => logout()} 
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Logout
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;