# Gunakan Node.js image
FROM node:18

# Set working directory
WORKDIR /submission-cancer-predivt

# Copy package.json dan install dependencies
COPY package*.json ./
RUN npm install

# Copy seluruh kode aplikasi ke dalam container
COPY . .

# Tentukan port yang digunakan aplikasi
EXPOSE 8080

# Jalankan aplikasi saat container dijalankan
CMD ["node", "app.js"]
