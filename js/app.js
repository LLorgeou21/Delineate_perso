// Phase 3: Visualisation avec Cornerstone.js (NIfTI + DICOM)
class IRMViewer {
    constructor() {
        this.cornerstone = window.cornerstone;
        this.pako = window.pako;
        this.dicomParser = window.dicomParser;
        this.imageData = null;
        this.currentSlices = { axial: 0, sagittal: 0, coronal: 0 };
        this.initialized = false;
        this.cornerstoneEnabled = false;
        
        console.log('🚀 Phase 3: Cornerstone.js pour NIfTI + DICOM');
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        // Initialise Cornerstone si disponible
        if (this.cornerstone) {
            try {
                await this.initializeCornerstone();
                this.cornerstoneEnabled = true;
                this.updateStatus('✅ Cornerstone.js initialisé - Prêt pour NIfTI/DICOM');
            } catch (error) {
                console.error('Erreur initialisation Cornerstone:', error);
                this.updateStatus('❌ Cornerstone échoué - Mode basique activé');
            }
        } else {
            this.updateStatus('❌ Cornerstone non chargé - Mode basique');
        }
        
        this.setupEventListeners();
        this.initialized = true;
        this.hideLoading();
    }

    async initializeCornerstone() {
        console.log('🔧 Initialisation de Cornerstone.js...');
        
        // Configure les viewports Cornerstone
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                this.cornerstone.enable(element);
                
                // Configuration initiale du viewport
                const defaultViewport = {
                    scale: 1,
                    translation: { x: 0, y: 0 },
                    voi: { windowWidth: 256, windowCenter: 128 },
                    invert: false,
                    pixelReplication: false,
                    rotation: 0,
                    hflip: false,
                    vflip: false,
                    modalityLUT: null,
                    voiLUT: null,
                    colormap: null
                };
                
                this.cornerstone.setViewport(element, defaultViewport);
                
                // Redimensionne le viewport quand la fenêtre change
                window.addEventListener('resize', () => {
                    if (this.cornerstone.getImage(element)) {
                        this.fitViewportToWindow(element);
                    }
                });
            }
        });
        
        // Configure les contrôleurs de vue
        this.setupCornerstoneControls();
        
        // Ajoute la navigation par molette
        this.setupWheelNavigation();
        
        console.log('✅ Cornerstone.js initialisé');
    }

    attachSliderEvents() {
        const windowLevel = document.getElementById('window-level');
        const windowWidth = document.getElementById('window-width');
        
        if (windowLevel && windowWidth) {
            windowLevel.addEventListener('input', (e) => {
                this.updateViewportWindowLevel(parseInt(e.target.value), parseInt(windowWidth.value));
            });
            
            windowWidth.addEventListener('input', (e) => {
                this.updateViewportWindowLevel(parseInt(windowLevel.value), parseInt(e.target.value));
            });
        }
    }

    createSliderLabels() {
        const controlGroup = document.querySelector('.control-group');
        if (!controlGroup) return;
        
        // Sauvegarde les valeurs actuelles des sliders avant de les recréer
        const currentLevel = document.getElementById('window-level')?.value || 128;
        const currentWidth = document.getElementById('window-width')?.value || 256;
        
        // Crée les conteneurs pour les labels
        const luminanceContainer = document.createElement('div');
        luminanceContainer.className = 'slider-container';
        luminanceContainer.innerHTML = `
            <label for="window-level" class="slider-label">Luminosité</label>
            <input type="range" id="window-level" min="0" max="255" value="${currentLevel}">
        `;
        
        const contrastContainer = document.createElement('div');
        contrastContainer.className = 'slider-container';
        contrastContainer.innerHTML = `
            <label for="window-width" class="slider-label">Contraste</label>
            <input type="range" id="window-width" min="1" max="255" value="${currentWidth}">
        `;
        
        // Remplace le contenu existant
        controlGroup.innerHTML = '';
        controlGroup.appendChild(luminanceContainer);
        controlGroup.appendChild(contrastContainer);
    }

    setupCornerstoneControls() {
        // Crée les labels des sliders
        this.createSliderLabels();
        
        // Réattache les événements après avoir créé les nouveaux sliders
        this.attachSliderEvents();
        
        // Boutons de contrôle
        document.getElementById('reset-view')?.addEventListener('click', () => this.resetViewports());
        document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomViewports(1.2));
        document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomViewports(0.8));
    }

    setupEventListeners() {
        const fileInput = document.getElementById('file-input');
        if (!fileInput) return;

        fileInput.addEventListener('change', (event) => {
            this.handleFileSelect(event);
        });

        this.setupNavigationControls();
    }

    setupNavigationControls() {
        document.getElementById('axial-prev')?.addEventListener('click', () => this.navigateSlice('axial', -1));
        document.getElementById('axial-next')?.addEventListener('click', () => this.navigateSlice('axial', 1));
        document.getElementById('sagittal-prev')?.addEventListener('click', () => this.navigateSlice('sagittal', -1));
        document.getElementById('sagittal-next')?.addEventListener('click', () => this.navigateSlice('sagittal', 1));
        document.getElementById('coronal-prev')?.addEventListener('click', () => this.navigateSlice('coronal', -1));
        document.getElementById('coronal-next')?.addEventListener('click', () => this.navigateSlice('coronal', 1));
    }

    async checkBackendStatus() {
        try {
            const response = await fetch(`${this.baseURL}/api/status`);
            const status = await response.json();
            
            if (status.ready) {
                this.updateStatus('✅ Backend connecté');
            } else {
                this.updateStatus('⚠️ Backend en cours de démarrage');
            }
        } catch (error) {
            this.updateStatus('❌ Backend non disponible - Mode local');
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Vérification du type de fichier
        const isNifti = file.name.match(/\.nii(\.gz)?$/i);
        const isDicom = file.name.match(/\.dcm$|\.dicom$/i);

        if (!isNifti && !isDicom) {
            this.showError('Veuillez sélectionner un fichier NIfTI ou DICOM');
            return;
        }

        this.showLoading('Upload et traitement du fichier...');

        try {
            // Option 1: Traitement local (actuel)
            if (isNifti) {
                await this.loadNiftiFile(file);
            } else if (isDicom) {
                await this.loadDicomFile(file);
            }

            // Option 2: Envoi au backend
            // const result = await window.IRMApi.uploadFile(file);
            // this.processBackendResponse(result);

            this.displayFileInfo(file);
            this.updateStatus('✅ Fichier chargé avec succès');

        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async loadNiftiFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    console.log('📖 Lecture fichier NIfTI avec Cornerstone...');
                    
                    const arrayBuffer = e.target.result;
                    
                    // Décompression si .gz
                    let dataToParse = arrayBuffer;
                    if (file.name.endsWith('.gz')) {
                        console.log('🔧 Décompression gzip...');
                        const compressed = new Uint8Array(arrayBuffer);
                        const decompressed = this.pako.inflate(compressed);
                        dataToParse = decompressed.buffer;
                    }
                    
                    // Parse NIfTI et convertit pour Cornerstone
                    this.parseNiftiForCornerstone(dataToParse, file.name);
                    
                    this.updateStatus('✅ ' + file.name + ' (NIfTI) chargé');
                    resolve();
                    
                } catch (error) {
                    console.error('Erreur NIfTI:', error);
                    reject(new Error('Erreur NIfTI: ' + error.message));
                }
            };
            
            reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
            reader.readAsArrayBuffer(file);
        });
    }

    async loadDicomFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    console.log('📖 Lecture fichier DICOM avec Cornerstone...');
                    
                    const arrayBuffer = e.target.result;
                    
                    // Utilise dicom-parser pour lire le fichier DICOM
                    const byteArray = new Uint8Array(arrayBuffer);
                    const dataSet = this.dicomParser.parseDicom(byteArray);
                    
                    console.log('📊 En-tête DICOM:', dataSet);
                    
                    // Convertit DICOM pour Cornerstone
                    this.parseDicomForCornerstone(dataSet, arrayBuffer, file.name);
                    
                    this.updateStatus('✅ ' + file.name + ' (DICOM) chargé');
                    resolve();
                    
                } catch (error) {
                    console.error('Erreur DICOM:', error);
                    reject(new Error('Erreur DICOM: ' + error.message));
                }
            };
            
            reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
            reader.readAsArrayBuffer(file);
        });
    }

    parseNiftiForCornerstone(arrayBuffer, fileName) {
        console.log('🔍 Conversion NIfTI pour Cornerstone...');
        
        const dataView = new DataView(arrayBuffer);
        
        // Lecture du header NIfTI
        const width = dataView.getInt16(42, true);
        const height = dataView.getInt16(44, true);
        const depth = dataView.getInt16(46, true);
        const datatype = dataView.getInt16(70, true);
        
        console.log('📐 Dimensions NIfTI:', { width, height, depth, datatype });
        
        // Extraction des données
        const voxOffset = 352;
        const imageData = this.extractNiftiImageData(dataView, voxOffset, datatype, width, height, depth);
        
        // Crée les images Cornerstone
        this.createCornerstoneImagesFromNifti(imageData, width, height, depth, fileName);
    }

    extractNiftiImageData(dataView, voxOffset, datatype, width, height, depth) {
        const bytesPerVoxel = this.getBytesPerVoxel(datatype);
        const totalVoxels = width * height * depth;
        const result = new Array(totalVoxels);
        
        for (let i = 0; i < totalVoxels; i++) {
            const byteOffset = voxOffset + i * bytesPerVoxel;
            
            if (byteOffset + bytesPerVoxel <= dataView.byteLength) {
                switch(datatype) {
                    case 2: result[i] = dataView.getUint8(byteOffset); break;
                    case 4: result[i] = dataView.getInt16(byteOffset, true); break;
                    case 8: result[i] = dataView.getInt32(byteOffset, true); break;
                    case 16: result[i] = dataView.getFloat32(byteOffset, true); break;
                    case 512: result[i] = dataView.getUint16(byteOffset, true); break;
                    default: result[i] = dataView.getUint8(byteOffset);
                }
            } else {
                result[i] = 0;
            }
        }
        
        return result;
    }

    parseDicomForCornerstone(dataSet, arrayBuffer, fileName) {
        console.log('🔍 Conversion DICOM pour Cornerstone...');
        
        try {
            // Pour DICOM, on suppose un volume simple (une seule slice pour l'instant)
            // Mais on peut extraire les dimensions si disponibles
            const rows = dataSet.uint16('x00280010') || 256;
            const columns = dataSet.uint16('x00280011') || 256;
            
            // Crée une image Cornerstone à partir des données DICOM
            const imageId = `dicom:${fileName}`;
            
            const cornerstoneImage = {
                imageId: imageId,
                minPixelValue: 0,
                maxPixelValue: 255,
                slope: 1.0,
                intercept: 0,
                windowCenter: 128,
                windowWidth: 256,
                getPixelData: () => this.getDicomPixelData(dataSet, arrayBuffer),
                rows: rows,
                columns: columns,
                height: rows,
                width: columns,
                color: false,
                columnPixelSpacing: 1.0,
                rowPixelSpacing: 1.0,
                sizeInBytes: rows * columns * 2
            };
            
            // Pour DICOM, on initialise aussi au "centre" (slice 0 pour un seul fichier)
            this.currentSlices = {
                axial: 0,
                sagittal: 0,
                coronal: 0
            };
            
            // Affiche dans tous les viewports
            this.displayInAllViewports(cornerstoneImage);
            
            // Met à jour les informations
            this.updateSliceInfoDisplays();
            
        } catch (error) {
            console.error('Erreur conversion DICOM:', error);
            throw new Error('Format DICOM non supporté');
        }
    }

    getDicomPixelData(dataSet, arrayBuffer) {
        // Extrait les données pixel du DICOM
        const pixelDataElement = dataSet.elements.x7fe00010;
        if (pixelDataElement) {
            const offset = pixelDataElement.dataOffset;
            const length = pixelDataElement.length;
            const byteArray = new Uint8Array(arrayBuffer, offset, length);
            
            // Convertit en Int16 pour Cornerstone
            const pixelData = new Int16Array(byteArray.buffer);
            return pixelData;
        }
        
        // Fallback: génère des données de test
        return this.generateTestPixelData(256, 256);
    }

    generateTestPixelData(width, height) {
        const pixelData = new Int16Array(width * height);
        for (let i = 0; i < pixelData.length; i++) {
            pixelData[i] = Math.random() * 255;
        }
        return pixelData;
    }

    createCornerstoneImagesFromNifti(imageData, width, height, depth, fileName) {
        console.log('🎨 Création images Cornerstone depuis NIfTI (3 orientations)...');
        
        // Normalise les données complètes
        const normalizedData = this.normalizeImageData(imageData);
        
        // Crée les images pour les 3 orientations avec leurs dimensions
        this.cornerstoneImages = {
            axial: this.createOrientationImages(normalizedData, width, height, depth, 'axial'),
            sagittal: this.createOrientationImages(normalizedData, width, height, depth, 'sagittal'),
            coronal: this.createOrientationImages(normalizedData, width, height, depth, 'coronal')
        };
        
        this.imageData = {
            dimensions: [width, height, depth],
            images: this.cornerstoneImages,
            loaded: true
        };
        
        // Définit les slices de départ au CENTRE pour chaque axe
        this.currentSlices = {
            axial: Math.floor(depth / 2),        // Milieu de l'axe Z
            sagittal: Math.floor(width / 2),     // Milieu de l'axe X
            coronal: Math.floor(height / 2)      // Milieu de l'axe Y
        };
        
        // Ajuste la taille des viewports selon les dimensions
        this.adjustViewportSizes();
        
        // Affiche les slices initiales (maintenant au centre)
        this.displayCurrentSlices();
        
        // Met à jour les informations de slice
        this.updateSliceInfoDisplays();
    }

    updateSliceInfoDisplays() {
        if (!this.imageData) return;
        
        const dims = this.imageData.dimensions;
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            let maxSlice, currentSlice;
            
            switch(view) {
                case 'axial':
                    maxSlice = dims[2] - 1;
                    currentSlice = this.currentSlices[view];
                    break;
                case 'sagittal':
                    maxSlice = dims[0] - 1;
                    currentSlice = this.currentSlices[view];
                    break;
                case 'coronal':
                    maxSlice = dims[1] - 1;
                    currentSlice = this.currentSlices[view];
                    break;
            }
            
            const infoElement = document.getElementById(`${view}-info`);
            if (infoElement) {
                infoElement.textContent = `Slice: ${currentSlice + 1}/${maxSlice + 1}`;
            }
        });
    }

    adjustViewportSizes() {
        const views = ['axial', 'sagittal', 'coronal'];
        const fixedSize = 256; // Taille fixe pour toutes les vues
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                element.style.width = `${fixedSize}px`;
                element.style.height = `${fixedSize}px`;
            }
        });
    }

    setupWheelNavigation() {
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                element.addEventListener('wheel', (event) => {
                    event.preventDefault(); // Empêche le scroll de la page
                    
                    // Détermine la direction du scroll
                    const direction = event.deltaY > 0 ? 1 : -1;
                    
                    // Navigue dans les slices
                    this.navigateSlice(view, direction);
                }, { passive: false });
            }
        });
    }

    createOrientationImages(normalizedData, width, height, depth, orientation) {
        console.log(`🔄 Création images orientation: ${orientation}`);
        
        const images = [];
        let sliceCount, getPixelData;
        
        // Définit une taille fixe pour toutes les orientations
        const base_taille=256
        const fixedWidth = base_taille*1.5;
        const fixedHeight = base_taille;
        
        switch(orientation) {
            case 'axial':
                sliceCount = depth;
                getPixelData = (sliceIndex) => {
                    const originalSlice = this.getAxialSlice(normalizedData, width, height, depth, sliceIndex);
                    return this.resizePixelData(originalSlice, width, height, fixedWidth, fixedHeight);
                };
                break;
            case 'sagittal':
                sliceCount = width;
                getPixelData = (sliceIndex) => {
                    const originalSlice = this.getSagittalSlice(normalizedData, width, height, depth, sliceIndex);
                    return this.resizePixelData(originalSlice, height, depth, fixedWidth, fixedHeight);
                };
                break;
            case 'coronal':
                sliceCount = height;
                getPixelData = (sliceIndex) => {
                    const originalSlice = this.getCoronalSlice(normalizedData, width, height, depth, sliceIndex);
                    return this.resizePixelData(originalSlice, width, depth, fixedWidth, fixedHeight);
                };
                break;
        }
        
        for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
            const imageId = `nifti:${orientation}:${sliceIndex}`;
            const pixelData = getPixelData(sliceIndex);
            
            const cornerstoneImage = {
                imageId: imageId,
                minPixelValue: 0,
                maxPixelValue: 255,
                slope: 1.0,
                intercept: 0,
                windowCenter: 128,
                windowWidth: 256,
                getPixelData: () => pixelData,
                rows: fixedHeight,
                columns: fixedWidth,
                height: fixedHeight,
                width: fixedWidth,
                color: false,
                columnPixelSpacing: 1.0,
                rowPixelSpacing: 1.0,
                sizeInBytes: fixedWidth * fixedHeight
            };
            
            images.push(cornerstoneImage);
        }
        
        console.log(`✅ ${orientation}: ${images.length} slices redimensionnées à ${fixedWidth}×${fixedHeight}`);
        return { images, displayWidth: fixedWidth, displayHeight: fixedHeight };
    }


    resizePixelData(originalData, originalWidth, originalHeight, newWidth, newHeight) {
        const resizedData = new Uint8Array(newWidth * newHeight);
        
        const scaleX = originalWidth / newWidth;
        const scaleY = originalHeight / newHeight;
        
        for (let y = 0; y < newHeight; y++) {
            for (let x = 0; x < newWidth; x++) {
                // Calcul des coordonnées dans l'image originale
                const origX = Math.floor(x * scaleX);
                const origY = Math.floor(y * scaleY);
                
                // S'assurer qu'on ne dépasse pas les limites
                const safeX = Math.min(origX, originalWidth - 1);
                const safeY = Math.min(origY, originalHeight - 1);
                
                // Index dans les tableaux original et redimensionné
                const origIndex = safeY * originalWidth + safeX;
                const newIndex = y * newWidth + x;
                
                if (origIndex < originalData.length) {
                    resizedData[newIndex] = originalData[origIndex];
                } else {
                    resizedData[newIndex] = 0;
                }
            }
        }
        
        return resizedData;
    }

    getAxialSlice(normalizedData, width, height, depth, sliceIndex) {
        const sliceData = new Uint8Array(width * height);
        const sliceOffset = sliceIndex * width * height;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pos3D = sliceOffset + (y * width + x);
                const pos2D = y * width + x;
                
                if (pos3D < normalizedData.length) {
                    sliceData[pos2D] = normalizedData[pos3D];
                } else {
                    sliceData[pos2D] = 0;
                }
            }
        }
        
        return sliceData;
    }

    getSagittalSlice(normalizedData, width, height, depth, sliceIndex) {
        // Sagittal: coupe selon l'axe X (vue de côté)
        const sliceData = new Uint8Array(height * depth);
        
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                const pos3D = (z * width * height) + (y * width) + sliceIndex;
                const pos2D = z * height + y;
                
                if (pos3D < normalizedData.length) {
                    sliceData[pos2D] = normalizedData[pos3D];
                } else {
                    sliceData[pos2D] = 0;
                }
            }
        }
        
        return sliceData;
    }

    getCoronalSlice(normalizedData, width, height, depth, sliceIndex) {
        // Coronal: coupe selon l'axe Y (vue de face)
        const sliceData = new Uint8Array(width * depth);
        
        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                const pos3D = (z * width * height) + (sliceIndex * width) + x;
                const pos2D = z * width + x;
                
                if (pos3D < normalizedData.length) {
                    sliceData[pos2D] = normalizedData[pos3D];
                } else {
                    sliceData[pos2D] = 0;
                }
            }
        }
        
        return sliceData;
    }


    getSlicePixelData(normalizedData, width, height, sliceIndex) {
        const sliceOffset = sliceIndex * width * height;
        const sliceData = new Uint8Array(width * height);
        
        for (let i = 0; i < width * height; i++) {
            if (sliceOffset + i < normalizedData.length) {
                sliceData[i] = normalizedData[sliceOffset + i];
            } else {
                sliceData[i] = 0;
            }
        }
        
        return sliceData;
    }

    normalizeImageData(rawData) {
        let min = Infinity;
        let max = -Infinity;
        
        for (let i = 0; i < rawData.length; i++) {
            if (rawData[i] < min) min = rawData[i];
            if (rawData[i] > max) max = rawData[i];
        }
        
        if (max === min) max = min + 1;
        const range = max - min;
        const normalized = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; i++) {
            normalized[i] = Math.round(((rawData[i] - min) / range) * 255);
        }
        
        return normalized;
    }

    displayCurrentSlices() {
        if (!this.imageData || !this.cornerstoneEnabled || !this.cornerstoneImages) return;
        
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            const sliceIndex = this.currentSlices[view];
            
            if (element && 
                this.cornerstoneImages[view] && 
                this.cornerstoneImages[view].images && 
                this.cornerstoneImages[view].images[sliceIndex]) {
                
                this.cornerstone.displayImage(element, this.cornerstoneImages[view].images[sliceIndex]);
                
                // Met à jour les viewports pour s'adapter à la nouvelle taille
                this.cornerstone.resize(element, true);
            }
        });
    }

    displayInAllViewports(cornerstoneImage) {
        if (!this.cornerstoneEnabled) return;
        
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                this.cornerstone.displayImage(element, cornerstoneImage);
            }
        });
    }

    navigateSlice(view, direction) {
        if (!this.imageData || !this.cornerstoneImages) return;
        
        // Détermine le nombre max de slices selon l'orientation
        let maxSlice;
        switch(view) {
            case 'axial':
                maxSlice = this.imageData.dimensions[2] - 1; // depth
                break;
            case 'sagittal':
                maxSlice = this.imageData.dimensions[0] - 1; // width
                break;
            case 'coronal':
                maxSlice = this.imageData.dimensions[1] - 1; // height
                break;
        }
        
        let newSlice = this.currentSlices[view] + direction;
        newSlice = Math.max(0, Math.min(maxSlice, newSlice));
        
        // Vérifie si la slice a changé
        if (newSlice !== this.currentSlices[view]) {
            this.currentSlices[view] = newSlice;
            
            if (this.cornerstoneEnabled) {
                this.displayCurrentSlices();
            }
            
            // Met à jour toutes les informations de slice
            this.updateSliceInfoDisplays();
            
            // Feedback visuel optionnel
            this.highlightActiveView(view);
        }
    }


    highlightActiveView(activeView) {
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            const panel = element?.closest('.view-panel');
            
            if (panel) {
                if (view === activeView) {
                    panel.style.boxShadow = '0 0 0 3px #4CAF50';
                    panel.style.transition = 'box-shadow 0.3s ease';
                } else {
                    panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
                }
            }
        });
    }

    updateViewportWindowLevel(center, width) {
        if (!this.cornerstoneEnabled) return;
        
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                const viewport = this.cornerstone.getViewport(element);
                if (viewport) {
                    viewport.voi.windowWidth = width;
                    viewport.voi.windowCenter = center;
                    this.cornerstone.setViewport(element, viewport);
                }
            }
        });
    }

    fitViewportToWindow(element) {
        const viewport = this.cornerstone.getViewport(element);
        if (viewport) {
            // Réinitialise la translation
            viewport.translation.x = 0;
            viewport.translation.y = 0;
            
            // Calcule l'échelle pour fitter l'image dans le viewport
            const image = this.cornerstone.getImage(element);
            if (image) {
                const viewportWidth = element.clientWidth;
                const viewportHeight = element.clientHeight;
                const scaleX = viewportWidth / image.width;
                const scaleY = viewportHeight / image.height;
                viewport.scale = Math.min(scaleX, scaleY);
                
                // Centre l'image
                viewport.translation.x = (viewportWidth - image.width * viewport.scale) / 2;
                viewport.translation.y = (viewportHeight - image.height * viewport.scale) / 2;
            }
            
            this.cornerstone.setViewport(element, viewport);
        }
    }


    resetViewports() {
        if (!this.cornerstoneEnabled) return;
        
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                this.cornerstone.reset(element);
                this.fitViewportToWindow(element);
            }
        });
    }

    zoomViewports(factor) {
        if (!this.cornerstoneEnabled) return;
        
        const views = ['axial', 'sagittal', 'coronal'];
        
        views.forEach(view => {
            const element = document.getElementById(`${view}-view`);
            if (element) {
                const viewport = this.cornerstone.getViewport(element);
                if (viewport) {
                    viewport.scale *= factor;
                    this.cornerstone.setViewport(element, viewport);
                }
            }
        });
    }

    getBytesPerVoxel(datatype) {
        switch(datatype) {
            case 2: return 1; case 4: return 2; case 8: return 4;
            case 16: return 4; case 64: return 8; case 512: return 2;
            default: return 2;
        }
    }

    updateStatus(message) {
        const statusElement = document.getElementById('app-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log('Status:', message);
    }

    displayFileInfo(file) {
        const fileInfo = document.getElementById('file-info');
        if (!fileInfo || !this.imageData || !this.cornerstoneImages) return;
        
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const isNifti = file.name.match(/\.nii(\.gz)?$/i);
        const dims = this.imageData.dimensions;
        
        fileInfo.innerHTML = `
            <h3>🎯 Visualisation 3D - Démarrage au Centre</h3>
            <p><strong>Fichier:</strong> ${file.name}</p>
            <p><strong>Taille:</strong> ${sizeMB} MB</p>
            <p><strong>Format:</strong> ${isNifti ? 'NIfTI' : 'DICOM'}</p>
            <p><strong>Dimensions voxels:</strong> ${dims[0]} × ${dims[1]} × ${dims[2]}</p>
        `;
        fileInfo.classList.remove('hidden');
    }

    showLoading(message) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.textContent = message;
            loading.style.display = 'block';
        }
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    showError(message) {
        this.updateStatus('❌ ' + message);
        this.hideLoading();
    }
}

// Initialisation
function initializeApp() {
    console.log('🚀 Démarrage avec Cornerstone.js...');
    window.viewer = new IRMViewer();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    setTimeout(initializeApp, 100);
}