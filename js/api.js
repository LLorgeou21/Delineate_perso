// js/api.js
class IRMApiService {
    constructor() {
        // URL de votre backend via le tunnel
        this.baseURL = 'https://f98bfe1645c670.lhr.life'; // À remplacer
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${this.baseURL}/api/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('Upload failed');
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async processNifti(fileData) {
        const response = await fetch(`${this.baseURL}/api/process/nifti`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(fileData)
        });
        return await response.json();
    }

    async getSegmentation(maskData) {
        const response = await fetch(`${this.baseURL}/api/segment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: maskData })
        });
        return await response.json();
    }
    async testConnection() {
        try {
            const response = await fetch(`${this.baseURL}/api/test-connection`);
            const data = await response.json();
            console.log('✅ Connexion backend:', data);
            return data;
        } catch (error) {
            console.error('❌ Erreur connexion backend:', error);
            throw error;
        }
    }

    async checkHealth() {
        try {
            const response = await fetch(`${this.baseURL}/api/health`);
            return await response.json();
        } catch (error) {
            console.error('❌ Health check failed:', error);
            throw error;
        }
    }
}

// Instance globale
window.IRMApi = new IRMApiService();