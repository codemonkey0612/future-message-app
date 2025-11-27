import React from 'react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path?: string;
  state?: any;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav className="mb-6 text-sm text-gray-500" aria-label="Breadcrumb">
      <ol className="list-none p-0 inline-flex items-center space-x-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {item.onClick ? (
              <button onClick={item.onClick} className="hover:text-primary hover:underline">{item.label}</button>
            ) : item.path ? (
              <Link to={item.path} state={item.state} className="hover:text-primary hover:underline">{item.label}</Link>
            ) : (
              <span className="font-medium text-gray-700">{item.label}</span>
            )}
            {index < items.length - 1 && (
               <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;