import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { BlogPost } from './blog';
import ImageCarousel from './ImageCarousel';

interface BlogCardProps {
  post: BlogPost;
}

const BlogCard: React.FC<BlogCardProps> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 transform hover:shadow-lg">
      <ImageCarousel images={post.images} />

      <div className="p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-2">{post.title}</h2>
        <p className="text-gray-600 mb-4">{post.excerpt}</p>

        <button
          onClick={toggleExpand}
          className="flex items-center text-green-700 font-medium hover:text-green-800 transition-colors"
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'View less' : 'View more'}
          {isExpanded ?
            <ChevronUp className="ml-1 h-4 w-4" /> :
            <ChevronDown className="ml-1 h-4 w-4" />
          }
        </button>

        <div className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? 'max-h-[1000px] mt-4 opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="space-y-3 text-gray-700">
            {post.content.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogCard
