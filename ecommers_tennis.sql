-- SQL corregido para Aiven
-- Generado el 05-08-2025

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- Crear base de datos
DROP DATABASE IF EXISTS ecommers_tennis;
CREATE DATABASE ecommers_tennis;
USE ecommers_tennis;

-- Estructura de tabla para la tabla `products`
CREATE TABLE `products` (
  `id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `media` VARCHAR(255) DEFAULT NULL,
  `category` VARCHAR(50) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Volcado de datos para la tabla `products`
INSERT INTO `products` (`id`, `name`, `price`, `media`, `category`, `description`, `created_at`) VALUES
(29, 'TENIS', 120.00, '/uploads/1753682049863-424890258.jpeg', 'MUJER', 'conejito', '2025-07-28 05:54:09'),
(30, 'ALEJANDRO RAI', 0.01, '/uploads/1753682332226-725360681.jpg', 'HOMBRE', 'asdasd', '2025-07-28 05:58:52'),
(35, 'muru su', 10.00, NULL, 'MUJER', 'xd', '2025-08-02 15:58:33');

-- Estructura de tabla para la tabla `usuarios`
CREATE TABLE `usuarios` (
  `id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','cliente') NOT NULL,
  `nombre` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Volcado de datos para la tabla `usuarios`
INSERT INTO `usuarios` (`id`, `email`, `password`, `role`, `nombre`, `created_at`) VALUES
(1, 'admin@rahel.com', '$2b$10$sSc1wGsiHWUmX530AKUEKu7IIVT/1UpoUC6tTt6.GejX6yjOIJTP2', 'admin', 'Administrador RAHEL', '2025-07-27 04:57:26'),
(2, 'cliente@rahel.com', '$2b$10$SzV8dUh54rVsyvu/9hPKX.rlVkPmr5QbZH2AUoNDrpxsoGF4epcsq', 'cliente', 'Cliente Ejemplo', '2025-07-27 04:57:26'),
(3, 'ale@gmail.com', '$2b$10$tFn6BWQLWeQRvHKsV9bGK.GOkO0tdbHtdsxTFPGSKYLpxzwMtpEX2', 'cliente', 'Alejandro', '2025-07-28 02:00:01'),
(4, 'admin2@example.com', '$2b$10$ok75IoryI3yBSB/9i4eNx.P.1nX.FeaznAZYE6SrIveTd9nt1ay2.', 'admin', 'Admin Dos', '2025-07-28 02:02:54');

COMMIT;