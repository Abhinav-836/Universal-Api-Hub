import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const HeroScene = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 25;
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Floating particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 2000;
    const posArray = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 100;
      posArray[i+1] = (Math.random() - 0.5) * 60;
      posArray[i+2] = (Math.random() - 0.5) * 80 - 40;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // Central torus knot
    const knotGeo = new THREE.TorusKnotGeometry(3, 0.8, 256, 32, 3, 4);
    const knotMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.3,
      metalness: 0.7,
      roughness: 0.2,
      transparent: true,
      opacity: 0.25,
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    scene.add(knot);

    // Ambient and point lights
    const ambient = new THREE.AmbientLight(0x404060);
    scene.add(ambient);
    const light1 = new THREE.PointLight(0xa855f7, 0.8);
    light1.position.set(5, 5, 5);
    scene.add(light1);
    const light2 = new THREE.PointLight(0x06b6d4, 0.5);
    light2.position.set(-3, 2, 4);
    scene.add(light2);

    let time = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      time += 0.005;
      particles.rotation.y = time * 0.05;
      particles.rotation.x = Math.sin(time * 0.2) * 0.1;
      knot.rotation.x = time * 0.3;
      knot.rotation.y = time * 0.4;
      knot.rotation.z = time * 0.1;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div id="three-canvas" ref={containerRef} />;
};

export default HeroScene;