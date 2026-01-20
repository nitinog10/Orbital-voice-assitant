import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BotState } from '../types';

interface WireframeSphereProps {
  volume: number;
  state: BotState;
}

const WireframeSphere: React.FC<WireframeSphereProps> = ({ volume, state }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef(volume);
  const stateRef = useRef(state);

  useEffect(() => {
    volumeRef.current = volume;
    stateRef.current = state;
  }, [volume, state]);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    camera.position.z = 12;

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // --- Starfield (as per requested snippet) ---
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 8000;
    const positions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2000;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // --- Atmosphere Shaders ---
    const atmosphereVertexShader = `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const atmosphereFragmentShader = `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        gl_FragColor = vec4(glowColor, 1.0) * intensity;
      }
    `;

    const atmosphereGeometry = new THREE.SphereGeometry(5.4, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      uniforms: {
        glowColor: { value: new THREE.Color(0x3a86ff) },
      },
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    globeGroup.add(atmosphereMesh);

    // --- Wireframe Globe ---
    const wireframeGeometry = new THREE.SphereGeometry(5, 40, 40);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x3a86ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const wireframeGlobe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    globeGroup.add(wireframeGlobe);

    // --- Solid Core (Reacts to voice) ---
    const solidGeometry = new THREE.SphereGeometry(4.8, 64, 64);
    const solidMaterial = new THREE.MeshPhongMaterial({
      color: 0x050510,
      emissive: 0x3a86ff,
      emissiveIntensity: 0.3,
      shininess: 100,
    });
    const solidGlobe = new THREE.Mesh(solidGeometry, solidMaterial);
    globeGroup.add(solidGlobe);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(15, 15, 15);
    scene.add(pointLight);

    // --- Colors (as per requested snippet) ---
    const colors = [
      new THREE.Color(0x3a86ff), // Blue
      new THREE.Color(0x8338ec), // Purple
      new THREE.Color(0xff006e), // Pink
      new THREE.Color(0xfb5607), // Orange
      new THREE.Color(0xffbe0b), // Yellow
    ];
    let colorIndex = 0;
    let nextColorIndex = 1;
    let colorT = 0;
    const colorTransitionSpeed = 0.002;

    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const vol = volumeRef.current;
      const currentState = stateRef.current;

      colorT += colorTransitionSpeed;
      if (colorT >= 1) {
        colorT = 0;
        colorIndex = nextColorIndex;
        nextColorIndex = (nextColorIndex + 1) % colors.length;
      }
      const baseColor = new THREE.Color().copy(colors[colorIndex]).lerp(colors[nextColorIndex], colorT);
      
      // Update Materials
      wireframeGlobe.material.color = baseColor;
      atmosphereMesh.material.uniforms.glowColor.value = baseColor;
      solidGlobe.material.emissive = baseColor;
      solidGlobe.material.emissiveIntensity = 0.2 + (vol * 1.5);

      // Constant spinning
      const baseRot = 0.002;
      const spinSpeed = currentState === BotState.THINKING ? 0.02 : baseRot;
      
      wireframeGlobe.rotation.y += spinSpeed;
      solidGlobe.rotation.y += spinSpeed;
      atmosphereMesh.rotation.y += spinSpeed * 0.5;
      stars.rotation.y -= 0.0001;

      // Mouse Tilt Interaction
      const targetTiltX = mouseY * 0.3;
      const targetTiltY = mouseX * 0.3;
      globeGroup.rotation.x += (targetTiltX - globeGroup.rotation.x) * 0.05;
      globeGroup.rotation.y += (targetTiltY - globeGroup.rotation.y) * 0.05;

      // Pulse scaling
      const targetScale = 1.0 + (vol * 0.2);
      globeGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationId);
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 z-0 bg-black" />;
};

export default WireframeSphere;