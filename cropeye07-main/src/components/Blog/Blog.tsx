import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BlogCard from './BlogCard';
import { blogPosts } from '../Blog/blogData';

const Blog: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && activeIndex < blogPosts.length - 1) {
      setActiveIndex(prevIndex => prevIndex + 1);
    } else if (isRightSwipe && activeIndex > 0) {
      setActiveIndex(prevIndex => prevIndex - 1);
    }
  };

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.transform = `translateX(-${activeIndex * 100}%)`;
    }
  }, [activeIndex]);

  const goToPrevious = () => {
    setActiveIndex(prevIndex => Math.max(0, prevIndex - 1));
  };

  const goToNext = () => {
    setActiveIndex(prevIndex => Math.min(blogPosts.length - 1, prevIndex + 1));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-bold text-center mb-2 text-gray-800">
        Sugarcane Harvest Insights
      </h1>
      <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">
        Explore the critical relationship between harvest timing and sucrose levels in sugarcane production
      </p>

      <div className="relative overflow-hidden">
        <div
          ref={sliderRef}
          className="flex transition-transform duration-300 ease-in-out"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {blogPosts.map((post) => (
            <div key={post.id} className="min-w-full px-4 md:px-12">
              <BlogCard post={post} />
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-8 space-x-2">
          {blogPosts.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`h-3 w-3 rounded-full transition-colors ${
                index === activeIndex ? 'bg-green-600' : 'bg-gray-300'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goToPrevious}
          disabled={activeIndex === 0}
          className={`absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 shadow-md ${
            activeIndex === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white'
          }`}
          aria-label="Previous slide"
        >
          <ChevronLeft size={24} className="text-gray-800" />
        </button>

        <button
          onClick={goToNext}
          disabled={activeIndex === blogPosts.length - 1}
          className={`absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 shadow-md ${
            activeIndex === blogPosts.length - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white'
          }`}
          aria-label="Next slide"
        >
          <ChevronRight size={24} className="text-gray-800" />
        </button>
      </div>
    </div>
  );
};

export default Blog
