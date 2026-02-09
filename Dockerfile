FROM nginx:alpine

# Kopiraj HTML datoteko v nginx root
COPY index.html /usr/share/nginx/html/index.html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
