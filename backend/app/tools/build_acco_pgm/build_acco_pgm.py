# -*- coding: utf-8 -*-
"""
# build_acco_pgm.py - AccoTEST STS8300 Empty Project Generator and TREG Framework Tool
================================================================
Overview:
    Generates full AccoTEST STS8300 test program project from Excel specification sheets and integrates TREG framework (TEST_TRIM_VBG + 8-Site PinPlanner + Function timing).
    
    1. [Excel Parsing]: Parses Param test parameters and VI_source / Pins / Groups / cbits channels.
    2. [Project Generation]: Generates .PGS with MD5 signature, VS2013+ (.sln/.vcxproj), VS2005 (.vcproj), and VC6 (.dsp/.dsw).
    3. [TREG Integration]: Generates Pin_Channel_define.h, integrates inireader / treg / test_method framework, and creates <project>.treg.
    4. [Multi-Site Pin Binding]: Injects 8-Site PinPlanner binding block (STSSetMultiSiteBindEx) and TREG globals in test.cpp.
    5. [Lifecycle Hooking]: Injects dut.init() in UserInit() and STSMaskTHBConfigCheck() in UserLoad().
    6. [Driver Injection]: Injects CBITe relay macros, cbit/dcm instances, I2C read/write and OTP preview helpers.
    7. [Execution Timing]: Injects execution timing (TTR / clearTimeCsv / writeToTimeCsv) to export time.csv.
    8. [Build Verification]: Generates build_verify.cmd to compile and verify exported symbols via VS2013 cl.exe.

        python build_acco_pgm.py
        python build_acco_pgm.py HL9785X_TEMP.xlsx
        python build_acco_pgm.py --target HL9785X_TEMP
"""

import os
import sys
import re
import uuid
import shutil
import hashlib
import datetime
import argparse
from typing import List, Dict, Tuple, Optional, Set

# Ensure stdout encoding configuration on Windows
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Dynamically find and inject site-packages if needed
for _sp in [
    r'C:\Users\hongen\AppData\Local\Programs\Python\Python313\Lib\site-packages',
    os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python313\Lib\site-packages'),
]:
    if os.path.isdir(_sp) and _sp not in sys.path:
        sys.path.insert(0, _sp)

try:
    import xlrd
except ImportError:
    xlrd = None

try:
    import openpyxl
except ImportError:
    openpyxl = None

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(SCRIPT_DIR, 'template')
DEFAULT_SITE_CNT = 8
FRAMEWORK_FILES = ['test_method.h', 'inireader.h', 'inireader.cpp', 'treg.h', 'treg.cpp']
HELPER_FUNC_NAMES = ['I2CWriteSameData', 'I2Cread', 'DIO_I2C_Init', 'OTP_Preview_Byte']

# ============================================================================
# Default pins and groups definition (fallback when Excel does not contain Pins/Groups sheet)
# ============================================================================
DEFAULT_PINS = [
    ('ACM_SCC', 'ACM', ['S27_0', 'S28_0', 'S21_0', 'S22_0', 'S6_0', 'S5_0', 'S12_0', 'S11_0']),
    ('ACM_SCL2', 'ACM', ['S27_1', 'S28_1', 'S21_1', 'S22_1', 'S6_1', 'S5_1', 'S12_1', 'S11_1']),
    ('ACM_SDAT', 'ACM', ['S27_2', 'S28_2', 'S21_2', 'S22_2', 'S6_2', 'S5_2', 'S12_2', 'S11_2']),
    ('ACM_SCLK', 'ACM', ['S27_3', 'S28_3', 'S21_3', 'S22_3', 'S6_3', 'S5_3', 'S12_3', 'S11_3']),
    ('ACM_SSB0', 'ACM', ['S27_4', 'S28_4', 'S21_4', 'S22_4', 'S6_4', 'S5_4', 'S12_4', 'S11_4']),
    ('ACM_SSB1', 'ACM', ['S27_5', 'S28_5', 'S21_5', 'S22_5', 'S6_5', 'S5_5', 'S12_5', 'S11_5']),
    ('ACM_GPIO1', 'ACM', ['S27_6', 'S28_6', 'S21_6', 'S22_6', 'S6_6', 'S5_6', 'S12_6', 'S11_6']),
    ('ACM_GPIO0', 'ACM', ['S27_7', 'S28_7', 'S21_7', 'S22_7', 'S6_7', 'S5_7', 'S12_7', 'S11_7']),
    ('ACM_XHN1', 'ACM', ['S27_8', 'S28_8', 'S21_8', 'S22_8', 'S6_8', 'S5_8', 'S12_8', 'S11_8']),
    ('ACM_XHP1', 'ACM', ['S27_9', 'S28_9', 'S21_9', 'S22_9', 'S6_9', 'S5_9', 'S12_9', 'S11_9']),
    ('ACM_YHN2', 'ACM', ['S27_10', 'S28_10', 'S21_10', 'S22_10', 'S6_10', 'S5_10', 'S12_10', 'S11_10']),
    ('ACM_YHP2', 'ACM', ['S27_11', 'S28_11', 'S21_11', 'S22_11', 'S6_11', 'S5_11', 'S12_11', 'S11_11']),
    ('ACM_XOUT1', 'ACM', ['S27_12', 'S28_12', 'S21_12', 'S22_12', 'S6_12', 'S5_12', 'S12_12', 'S11_12']),
    ('ACM_XOUT2', 'ACM', ['S27_13', 'S28_13', 'S21_13', 'S22_13', 'S6_13', 'S5_13', 'S12_13', 'S11_13']),
    ('ACM_YOUT1', 'ACM', ['S27_14', 'S28_14', 'S21_14', 'S22_14', 'S6_14', 'S5_14', 'S12_14', 'S11_14']),
    ('ACM_YOUT2', 'ACM', ['S27_15', 'S28_15', 'S21_15', 'S22_15', 'S6_15', 'S5_15', 'S12_15', 'S11_15']),
    ('ACM_ZOUT1', 'ACM', ['S27_16', 'S28_16', 'S21_16', 'S22_16', 'S6_16', 'S5_16', 'S12_16', 'S11_16']),
    ('ACM_ZOUT2', 'ACM', ['S27_17', 'S28_17', 'S21_17', 'S22_17', 'S6_17', 'S5_17', 'S12_17', 'S11_17']),
    ('ACM_TESTA', 'ACM', ['S27_18', 'S28_18', 'S21_18', 'S22_18', 'S6_18', 'S5_18', 'S12_18', 'S11_18']),
    ('ACM_BRD', 'ACM', ['S27_23', 'S28_23', 'S21_23', 'S22_23', 'S6_23', 'S5_23', 'S12_23', 'S11_23']),
    ('qvm0', 'QVMe', ['S8_3', 'S8_2', 'S8_1', 'S8_0', 'S7_3', 'S7_2', 'S7_1', 'S7_0']),
    ('qtmue0', 'QTMUe', ['S23_3', 'S23_2', 'S23_1', 'S23_0', 'S10_3', 'S10_2', 'S10_1', 'S10_0']),
    ('FOVI_VDDA', 'FOVIe', ['S30_0', 'S29_0', 'S20_0', 'S19_0', 'S3_0', 'S4_0', 'S13_0', 'S14_0']),
    ('FOVI_VDDM', 'FOVIe', ['S30_1', 'S29_1', 'S20_1', 'S19_1', 'S3_1', 'S4_1', 'S13_1', 'S14_1']),
    ('FOVI_VDDIO', 'FOVIe', ['S30_2', 'S29_2', 'S20_2', 'S19_2', 'S3_2', 'S4_2', 'S13_2', 'S14_2']),
    ('FOVI_VDDC', 'FOVIe', ['S30_3', 'S29_3', 'S20_3', 'S19_3', 'S3_3', 'S4_3', 'S13_3', 'S14_3']),
    ('FOVI_AIN', 'FOVIe', ['S30_4', 'S29_4', 'S20_4', 'S19_4', 'S3_4', 'S4_4', 'S13_4', 'S14_4']),
    ('FOVI_XHSUP', 'FOVIe', ['S30_5', 'S29_5', 'S20_5', 'S19_5', 'S3_5', 'S4_5', 'S13_5', 'S14_5']),
    ('FOVI_YHSUP', 'FOVIe', ['S30_6', 'S29_6', 'S20_6', 'S19_6', 'S3_6', 'S4_6', 'S13_6', 'S14_6']),
    ('FOVI_TEMP', 'FOVIe', ['S30_7', 'S29_7', 'S20_7', 'S19_7', 'S3_7', 'S4_7', 'S13_7', 'S14_7']),
    ('FPVI0_VIN', 'FPVIe', ['S32_0', 'S31_0', 'S18_0', 'S17_0', 'S1_0', 'S2_0', 'S15_0', 'S16_0']),
    ('FPVI1_VOUT', 'FPVIe', ['S32_1', 'S31_1', 'S18_1', 'S17_1', 'S1_1', 'S2_1', 'S15_1', 'S16_1']),
]

DEFAULT_GROUPS = [
    ('ACM_ALL', 'ACM', ['ACM_SCC', 'ACM_SCL2', 'ACM_SDAT', 'ACM_SCLK', 'ACM_SSB0', 'ACM_SSB1', 'ACM_GPIO1', 'ACM_GPIO0', 'ACM_XHN1', 'ACM_XHP1', 'ACM_YHN2', 'ACM_YHP2', 'ACM_XOUT1', 'ACM_XOUT2', 'ACM_YOUT1', 'ACM_YOUT2', 'ACM_ZOUT1', 'ACM_ZOUT2', 'ACM_TESTA', 'ACM_BRD']),
    ('FOVI_ALL', 'FOVIe', ['FOVI_VDDA', 'FOVI_VDDM', 'FOVI_VDDIO', 'FOVI_VDDC', 'FOVI_AIN', 'FOVI_XHSUP', 'FOVI_YHSUP', 'FOVI_TEMP']),
    ('FPVI_ALL', 'FPVIe', ['FPVI0_VIN', 'FPVI1_VOUT']),
    ('ACM_GPIO', 'ACM', ['ACM_SCC', 'ACM_SCL2', 'ACM_SDAT', 'ACM_SCLK', 'ACM_SSB0', 'ACM_SSB1', 'ACM_GPIO1', 'ACM_GPIO0', 'ACM_XHN1', 'ACM_XHP1', 'ACM_YHN2', 'ACM_YHP2', 'ACM_XOUT1', 'ACM_XOUT2', 'ACM_YOUT1', 'ACM_YOUT2', 'ACM_ZOUT1', 'ACM_ZOUT2', 'ACM_TESTA', 'ACM_BRD']),
    ('FOVI_GPIO', 'FOVIe', ['FOVI_VDDA', 'FOVI_VDDM', 'FOVI_VDDIO', 'FOVI_VDDC', 'FOVI_AIN', 'FOVI_XHSUP', 'FOVI_YHSUP', 'FOVI_TEMP']),
]

MD_MAP = {'ACM': 'MD_ACM', 'QVMe': 'MD_QVMe', 'QTMUe': 'MD_QTMUe',
          'FOVIe': 'MD_FOVIe', 'FPVIe': 'MD_FPVIe'}

UNIT_MACROS = [
    '#define mA *1e3',
    '#define uA *1e6',
    '#define mV *1e3',
    '#define uV *1e6',
    '#define qtmu_hz *1e3',
    '#define Mhz *1e-6',
    '#define Khz *1e-3',
    '#define Neg2Pos *-1',
    '#define Kohm *1e-3',
    '#define Mohm *1e-6',
    '#define mohm *1e3',
]

K_MACRO_LINES = [
    '#define    K1_FP1H_XOUT1            96,    96,    96,    96,    63,    63,    63,    63',
    '#define    K2_FP1L_XOUT2            97,    97,    97,    97,    62,    62,    62,    62',
    '#define    K3_FP1H_YOUT1            98,    98,    98,    98,    61,    61,    61,    61',
    '#define    K4_FP1L_YOUT2            99,    99,    99,    99,    60,    60,    60,    60',
    '#define    K5_FP1H_ZOUT1            100,    100,    100,    100,    59,    59,    59,    59',
    '#define    K6_NC                    101,    101,    101,    101,    58,    58,    58,    58',
    '#define    K7_FP1L_ZOUT2            102,    102,    102,    102,    57,    57,    57,    57',
    '#define    K9_FP1H_GND              104,    104,    104,    104,    55,    55,    55,    55',
    '#define    K10_FP0H_XHP             105,    105,    105,    105,    54,    54,    54,    54',
    '#define    K11_FP0L_XHN             106,    106,    106,    106,    53,    53,    53,    53',
    '#define    K12_FP0H_YHP             107,    107,    107,    107,    52,    52,    52,    52',
    '#define    K13_FP0L_YHN             108,    108,    108,    108,    51,    51,    51,    51',
    '#define    K14_FP0H_GND             109,    109,    109,    109,    13,    13,    13,    13',
    '#define    K15_FP0L_GND             110,    110,    110,    110,    14,    14,    14,    14',
    '#define    K16_ACM_SDA_SCL          111,    111,    111,    111,    15,    15,    15,    15',
    '#define    K17_ACM_SDAT_SCKL        112,    112,    112,    112,    16,    16,    16,    16',
    '#define    K18_ACM_SSB0_SSB1        113,    113,    113,    113,    17,    17,    17,    17',
    '#define    K19_ACM_GPIO0_GPIO1      114,    114,    114,    114,    18,    18,    18,    18',
    '#define    K20_FP1H_R               115,    115,    115,    115,    19,    19,    19,    19',
    '#define    K21_FP1L_R               116,    116,    116,    116,    20,    20,    20,    20',
    '#define    K22_BUF6X_R              117,    117,    117,    117,    21,    21,    21,    21',
    '#define    K23_BUF10X_R             118,    118,    118,    118,    22,    22,    22,    22',
    '#define    K24_TMU_GPIO             119,    119,    119,    119,    23,    23,    23,    23',
    '#define    K25_CAP_VDDA             120,    120,    120,    120,    24,    24,    24,    24',
    '#define    K26_CAP_VDDM             121,    121,    121,    121,    25,    25,    25,    25',
    '#define    K27_CAP_VDDIO            122,    122,    122,    122,    26,    26,    26,    26',
    '#define    K28_CAP_VDDC             123,    123,    123,    123,    27,    27,    27,    27',
    '#define    K29_BUF_AIN              124,    124,    124,    124,    28,    28,    28,    28',
    '#define    K30_XHP_XHN              125,    125,    125,    125,    29,    29,    29,    29',
    '#define    K31_YHP_YHN              126,    126,    126,    126,    30,    30,    30,    30',
    '#define    K32_R_XSUP               127,    127,    127,    127,    31,    31,    31,    31',
    '#define    K33_R_YHSUP              77,    77,    77,    77,    32,    32,    32,    32',
    '#define    K34_R_FPVI0H             78,    78,    78,    78,    33,    33,    33,    33',
    '#define    K35_R_FPVI0L             79,    79,    79,    79,    34,    34,    34,    34',
    '#define    K36_QVML_GND             80,    80,    80,    80,    35,    35,    35,    35',
    '#define    K37_BUF_SHORT            81,    81,    81,    81,    36,    36,    36,    36',
    '#define    K38_QVMH_R               82,    82,    82,    82,    37,    37,    37,    37',
    '#define    K39_QVML_R               83,    83,    83,    83,    38,    38,    38,    38',
    '#define    K40_QVMH_BUF             84,    84,    84,    84,    39,    39,    39,    39',
    '#define    K6_I3C_DCM               101,    101,    101,    101,    5,    5,    5,    5',
    '#define    K8_I3C_ACM               103,    103,    103,    103,    7,    7,    7,    7',
    '#define K_ALL_CAP	K25_CAP_VDDA, K26_CAP_VDDM,  K27_CAP_VDDIO,	  K28_CAP_VDDC',
]

HELPER_FUNCS = {
    'I2CWriteSameData': 'void I2CWriteSameData(BYTE SlaveAddress, DWORD RegAddress, DWORD  data)\r\n{\r\n\tfor (int i = 0; i < SITE_NUM; i++)\r\n\t{\r\n\t\tulWriteData[i] = data;\r\n\t}\r\n\tdcm.I2CWriteData(SlaveAddress, RegAddress, 2, ulWriteData);\r\n}',
    'I2Cread': 'void I2Cread(int I2CREG, double  *readvale)\r\n{\r\n\tdcm.I2CReadData(I2C_ADDR_DEVICE, I2CREG, 2);\r\n\tdelay_us(100);\r\n \tSERIAL  readvale[SITE]  = (dcm.I2CGetReadData(SITE, 0) << 8) + dcm.I2CGetReadData(SITE, 1);\r\n}',
    'DIO_I2C_Init': 'void DIO_I2C_Init(float Period, float VIH, float VIL, float VOH, float VOL)\r\n{\r\n\tdcm.I2CSet(Period, SITE_NUM, DCM_REG16, "S24_0,S24_16,S24_32,S24_48,S9_48,S9_32,S9_16,S9_0", "S24_1,S24_17,S24_33,S24_49,S9_49,S9_33,S9_17,S9_1");//S24_0&scl,S24_1&sda\r\n\tdcm.I2CConnect();\r\n\r\n\tdcm.I2CSetSCLEdge(0, Period / 2);\r\n\tdcm.I2CSetSDAEdge(Period / 4, Period / 2, Period / 4, Period * 3 / 4);\r\n\tdcm.I2CSetPinLevel(VIH, VIL, VOH, VOL);\r\n\tdcm.SetDynamicLoad("SDA", TRUE, 0.003, 0.003, 1.8); //\r\n}',
    'OTP_Preview_Byte': 'void OTP_Preview_Byte(BYTE SlaveAddress, int RegAddress, const char* reg_str)\r\n{\r\n\tfor (int i = 0; i < SITE_NUM; i++)\r\n\t{\r\n\t\tulWriteData[i] = (DWORD)(dut.assy(reg_str).get_working(i));\r\n\t}\r\n\tdcm.I2CWriteData(SlaveAddress, RegAddress, 2, ulWriteData);\r\n\r\n}',
}

TRIM_VBG_FUNC = 'DUT_API int TEST_TRIM_VBG(short funcindex, LPCTSTR funclabel)\r\n{\r\n//{{AFX_STS_PARAM_PROTOTYPES\r\n    CParam *TRIM_VBG_PRE = StsGetParam(funcindex, "TRIM_VBG_PRE");\r\n    CParam *TRIM_VBG_PRE_BIT = StsGetParam(funcindex, "TRIM_VBG_PRE_BIT");\r\n    CParam *TRIM_VBG_POST = StsGetParam(funcindex, "TRIM_VBG_POST");\r\n    CParam *TRIM_VBG_POST_BIT = StsGetParam(funcindex, "TRIM_VBG_POST_BIT");\r\n    CParam *TRIM_VBG_TARGET = StsGetParam(funcindex, "TRIM_VBG_TARGET");\r\n//}}AFX_STS_PARAM_PROTOTYPES\r\n    // TODO: Add your function code here\r\n\r\n\tTRIM_NODE &trm_node = dut.trim("Trim_BGR_VREF");\r\n\tASSY_NODE &OTP_Reg = dut.assy("OTP_0x4408");\r\n\r\n\tint OTP_Reg_Adr = 0x4408;\r\n\tchar  Treg_Assy_Name[12] = "OTP_0x4408";\r\n\tconst int \ttrim_step = 8;\r\n\r\n   \tCParam *Trim_Params[5] = { TRIM_VBG_PRE, TRIM_VBG_PRE_BIT, TRIM_VBG_POST, TRIM_VBG_POST_BIT, TRIM_VBG_TARGET };\r\n\r\n\r\n\tcbit.SetOn(K_ALL_CAP,  - 1);\r\n\tdelay_ms(3);\r\n\tDIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq\t\r\n\tFOVI_VDDIO.Set(FV, 1.8, FOVIe_10V, FOVIe_100MA, FOVIe_RELAY_ON);\r\n\tdelay_ms(3);\r\n\tFOVI_VDDA.Set(FV, 2.8, FOVIe_10V, FOVIe_100MA, FOVIe_RELAY_ON);\r\n\tdelay_ms(3);\r\n\tFOVI_VDDM.Set(FV, 2.8, FOVIe_10V, FOVIe_100MA, FOVIe_RELAY_ON);\r\n\tdelay_ms(20);// \r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0xDE04, 0xAD58);\tdelay_us(300);  //\tunlock protection all\r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0x582C, 0x3FB3);\tdelay_us(300);  //\tlight sleep mode with all peri on w/o wdt, i2cm, spi\r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0x4C2C, 0x0000);\tdelay_us(300);  //\tset GPIO2 configuration\r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0x40B0, 0x3000);\tdelay_us(300);  //set GPIO2 as AIN (voltage limited by VDDIO=1.2V)\r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0x40CC, 0x0002);\tdelay_us(300);   //use Auto Detection I/O Level Mode\r\n\tdelay_ms(1);\r\n\r\n\tdelay_ms(2);\r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0x4024, 0x002B);\tdelay_us(300);   //enable Analog Monitor ch.05 for voltage test\r\n\tI2CWriteSameData(I2C_ADDR_DEVICE, 0x4800, 0x0001); delay_us(300); \t //turn on BGR VREF monitor path\r\n\tdelay_ms(2);\r\n \tFOVI_AIN.Set(FI, 0.0, FOVIe_10V, FOVIe_10MA, FOVIe_RELAY_SENSE_ON);\t // Can use BUFF to check the Vref value\r\n\tdelay_ms(2); \r\n\r\n\t///STEP///////////////////\r\n\tif (trimm_enable &&  trm_node.table_char_active())\r\n\t{\r\n\t\ttrm_node.save_working();\t\t\t\t\t\t\t\t\r\n\t\tfor (int step = 0; step < trim_step; step++)\r\n\t\t{\r\n\t\t\tSERIAL trm_node.set_working(step, SITE);  \r\n\t\t\tOTP_Preview_Byte(I2C_ADDR_DEVICE, OTP_Reg_Adr, Treg_Assy_Name);\r\n\t\t\tdelay_ms(1);\r\n\t\t\tFOVI_AIN.MeasureVI(40, 10);\r\n\t\t\tSERIAL\tsts_result[SITE] = FOVI_AIN.GetMeasResult(SITE, MVRET);\r\n\t\t\ttrm_node.table_char(sts_result, step);\t\t\t\t\t\t\t\t\t\t\t\t\r\n\t\t\tSERIAL\tTrim_Params[0]->SetTestResult(SITE, step, sts_result[SITE]);\t\t\r\n\t\t}\r\n\t\ttrm_node.restore_working();\t\t\t\t\t\t\t\t\t\t\t\t\t\r\n\t}\r\n\r\n\t////////////////////////////////////////////////PRE//////////////////////////////////////////////////////////\r\n\r\n\tif (trimm_enable)\r\n\t{\r\n\t\tSERIAL trm_node.set_working(0, SITE);\r\n\t\tOTP_Preview_Byte(I2C_ADDR_DEVICE, OTP_Reg_Adr, Treg_Assy_Name); \t//write Pre value of working \u3000\r\n\t}\r\n\tdelay_ms(1);\r\n\tFOVI_AIN.MeasureVI(4000, 10);\r\n\tSERIAL\tsts_result[SITE] = FOVI_AIN.GetMeasResult(SITE, MVRET);\r\n\tSERIAL\tTrim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);\r\n\tSERIAL\tTrim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));\r\n\r\n\t//************************************POST********************************************************\r\n\tif (trimm_enable)// if trim need,\r\n\t{\r\n\t\ttrm_node.pre(sts_result);\r\n\t\tif (trm_node.updated_by_trim())\r\n\t\t{\r\n\t\t\tOTP_Preview_Byte(I2C_ADDR_DEVICE, OTP_Reg_Adr, Treg_Assy_Name);  //write Post value of working  \u3000\r\n\t\t\tdelay_ms(1);\r\n\t\t\tFOVI_AIN.MeasureVI(40, 10);\r\n\t\t\tSERIAL\tsts_result[SITE] = FOVI_AIN.GetMeasResult(SITE, MVRET);\r\n\r\n\t\t}\r\n\t\ttrm_node.post(sts_result);\r\n\t}\r\n\r\n\tSERIAL\tTrim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);\r\n\tSERIAL\tTrim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));\r\n\tSERIAL\tTrim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));\r\n\r\n\tI2Cread(0x4408, sts_result);\r\n\tSERIAL\tTrim_Params[3]->SetTestResult(SITE, 0, sts_result[SITE]);\r\n\r\n    return 0;\r\n}'


# ============================================================================
# Basic file utility functions
# ============================================================================
def detect_encoding(file_path: str) -> str:
    with open(file_path, 'rb') as f:
        data = f.read()
    if data.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    try:
        data.decode('utf-8')
        return 'utf-8'
    except UnicodeDecodeError:
        pass
    try:
        data.decode('gb18030')
        return 'gb18030'
    except UnicodeDecodeError:
        return 'latin1'


def read_file(path: str) -> Tuple[str, str, str]:
    enc = detect_encoding(path)
    with open(path, 'r', encoding=enc, errors='ignore') as f:
        content = f.read()
    return content, enc, ('\r\n' if '\r\n' in content else '\n')


def write_file(path: str, content: str, enc: str):
    with open(path, 'w', encoding=enc, newline='') as f:
        f.write(content)


def find_matching_brace(text: str, start_idx: int) -> int:
    depth = 0
    i = start_idx
    n = len(text)
    while i < n:
        c = text[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def get_project_name(target_dir: str) -> str:
    for fname in os.listdir(target_dir):
        if fname.lower().endswith('.pgs'):
            return os.path.splitext(fname)[0]
    source_dir = os.path.join(target_dir, 'source')
    if os.path.isdir(source_dir):
        for fname in os.listdir(source_dir):
            if fname.lower().endswith('.vcxproj'):
                return os.path.splitext(fname)[0]
    return os.path.basename(os.path.abspath(target_dir))


# ============================================================================
# Excel Parsing functions (Param test parameters + VI_source / Pins / Groups channels)
# ============================================================================
def parse_cbits_sheet_rows(rows: List) -> List[str]:
    """
    Parse cbits sheet row data and generate CBITe relay channel macro definitions.
    Example format:
    #define    K1_FP1H_XOUT1            96,    96,    96,    96,    63,    63,    63,    63
    """
    if not rows:
        return []

    first_row = [str(c).strip() if c is not None else '' for c in rows[0]]
    has_header = any(re.match(r'^site\s*\d+$', c, re.I) for c in first_row) or any(
        c.lower() in ['cbit_name', 'cbit', 'relay', 'macro', 'name', 'relay_name', 'cbits'] for c in first_row
    )

    site_cols = []
    name_col = 0
    start_row = 0

    if has_header:
        start_row = 1
        for i, c in enumerate(first_row):
            if re.match(r'^site\s*\d+$', c, re.I):
                site_cols.append(i)
            elif c.lower() in ['cbit_name', 'cbit', 'relay', 'macro', 'name', 'relay_name', 'cbits']:
                name_col = i
        if not site_cols:
            site_cols = [i for i in range(len(first_row)) if i != name_col and first_row[i]]

    macro_lines = []
    cap_macros = []

    for r in rows[start_row:]:
        if not r or all(c is None or str(c).strip() == '' for c in r):
            continue
        m_name = str(r[name_col]).strip() if name_col < len(r) and r[name_col] is not None else ''
        if not m_name:
            for c in r:
                if c is not None and str(c).strip():
                    m_name = str(c).strip()
                    break
        if not m_name:
            continue
        if m_name.startswith('#define'):
            m_name = m_name.replace('#define', '').strip()

        # Handle combination macros (e.g. K_ALL_CAP)
        if ' ' in m_name or '\t' in m_name:
            parts = m_name.split(None, 1)
            m_name = parts[0]
            val_str = parts[1]
            macro_lines.append(f'#define    {m_name:<24} {val_str}')
            continue

        vals = []
        if site_cols:
            for c in site_cols:
                v = r[c] if c < len(r) else None
                if v is None or str(v).strip() == '':
                    continue
                if isinstance(v, float) and v.is_integer():
                    vals.append(str(int(v)))
                else:
                    vals.append(str(v).strip())
        else:
            for i, c in enumerate(r):
                if i == name_col or c is None or str(c).strip() == '':
                    continue
                v = c
                if isinstance(v, float) and v.is_integer():
                    vals.append(str(int(v)))
                else:
                    vals.append(str(v).strip())

        if vals:
            val_str = ',    '.join(vals)
            macro_lines.append(f'#define    {m_name:<24} {val_str}')
            if '_CAP_' in m_name.upper() or m_name.upper().endswith('_CAP') or 'CAP' in m_name.upper():
                cap_macros.append(m_name)

    if not any('K_ALL_CAP' in line for line in macro_lines) and cap_macros:
        macro_lines.append(f'#define K_ALL_CAP\t' + ', '.join(cap_macros))

    return macro_lines


def parse_excel(excel_path: str) -> Tuple[List[Dict], List[Tuple[str, List[Dict]]], List, List, int]:
    """
    Unified Excel parsing function:
    Returns:
        all_params: List of all parameters
        functions: Parameters grouped by test function
        pins: [(PinName, Type, [Site1, Site2, ...])]
        groups: [(GroupName, Type, [Pin1, Pin2, ...])]
        site_count: Site count (e.g. 8)
    """
    if not os.path.isfile(excel_path):
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    ext = os.path.splitext(excel_path)[1].lower()
    
    # 1. Read Param sheet
    all_params = []
    functions = []
    
    if ext == '.xls':
        if xlrd is None:
            raise ImportError("xlrd library is required to read .xls files")
        wb = xlrd.open_workbook(excel_path)
        sh_param = wb.sheet_by_name('Param') if 'Param' in wb.sheet_names() else wb.sheet_by_index(0)
        param_rows = []
        for r in range(sh_param.nrows):
            row_vals = []
            for c in range(sh_param.ncols):
                cell = sh_param.cell(r, c)
                if cell.ctype == xlrd.XL_CELL_NUMBER and cell.value.is_integer():
                    row_vals.append(str(int(cell.value)))
                elif cell.ctype == xlrd.XL_CELL_NUMBER:
                    row_vals.append(str(cell.value))
                else:
                    row_vals.append(str(cell.value).strip())
            param_rows.append(row_vals)
            
        # Read Pins / VI_source and Groups
        pins = []
        groups = []
        site_count = DEFAULT_SITE_CNT
        
        # Find pins sheet
        pin_sheet_name = None
        for s in ['vi_source', 'pins', 'site']:
            for actual_name in wb.sheet_names():
                if actual_name.lower() == s:
                    pin_sheet_name = actual_name
                    break
            if pin_sheet_name:
                break
                
        if pin_sheet_name:
            sh_pins = wb.sheet_by_name(pin_sheet_name)
            # Check if header contains Site1..SiteN
            if sh_pins.nrows > 0:
                header = [str(sh_pins.cell_value(0, c)).strip() for c in range(sh_pins.ncols)]
                site_cols = [i for i, h in enumerate(header) if re.match(r'^site\d+$', h, re.I)]
                if site_cols:
                    site_count = len(site_cols)
                    for r in range(1, sh_pins.nrows):
                        pname = str(sh_pins.cell_value(r, 0)).strip()
                        if not pname:
                            continue
                        ptype = str(sh_pins.cell_value(r, 1)).strip() if sh_pins.ncols > 1 else ''
                        sites = [str(sh_pins.cell_value(r, c)).strip() for c in site_cols]
                        pins.append((pname, ptype, sites))
                else:
                    # Attempt to read B1 cell as site count
                    if sh_pins.ncols > 1:
                        v = sh_pins.cell_value(0, 1)
                        if isinstance(v, (int, float)) and v > 0:
                            site_count = int(v)

        # Find groups sheet
        group_sheet_name = None
        for actual_name in wb.sheet_names():
            if actual_name.lower() == 'groups':
                group_sheet_name = actual_name
                break
        if group_sheet_name:
            sh_g = wb.sheet_by_name(group_sheet_name)
            for r in range(1, sh_g.nrows):
                gname = str(sh_g.cell_value(r, 0)).strip()
                if not gname:
                    continue
                gtype = str(sh_g.cell_value(r, 1)).strip() if sh_g.ncols > 1 else ''
                inc_str = str(sh_g.cell_value(r, 2)).strip() if sh_g.ncols > 2 else ''
                inc = [x.strip() for x in inc_str.split(',') if x.strip()]
                groups.append((gname, gtype, inc))

        # Find cbits sheet
        cbit_sheet_name = None
        for actual_name in wb.sheet_names():
            if actual_name.lower() in ['cbits', 'cbit', 'cbit_source', 'cbits_source']:
                cbit_sheet_name = actual_name
                break
        cbits_macros = []
        if cbit_sheet_name:
            sh_cb = wb.sheet_by_name(cbit_sheet_name)
            cb_rows = []
            for r in range(sh_cb.nrows):
                row_vals = []
                for c in range(sh_cb.ncols):
                    cell = sh_cb.cell(r, c)
                    if cell.ctype == xlrd.XL_CELL_NUMBER and cell.value.is_integer():
                        row_vals.append(str(int(cell.value)))
                    elif cell.ctype == xlrd.XL_CELL_NUMBER:
                        row_vals.append(str(cell.value))
                    elif cell.ctype == xlrd.XL_CELL_EMPTY:
                        row_vals.append(None)
                    else:
                        row_vals.append(str(cell.value).strip())
                cb_rows.append(row_vals)
            cbits_macros = parse_cbits_sheet_rows(cb_rows)

    elif ext == '.xlsx':
        if openpyxl is None:
            raise ImportError("openpyxl library is required to read .xlsx files")
        wb = openpyxl.load_workbook(excel_path, data_only=True)
        sh_param = wb['Param'] if 'Param' in wb.sheetnames else wb.active
        param_rows = []
        for row in sh_param.iter_rows(values_only=True):
            row_vals = []
            for val in row:
                if val is None:
                    row_vals.append('')
                elif isinstance(val, float) and val.is_integer():
                    row_vals.append(str(int(val)))
                else:
                    row_vals.append(str(val).strip())
            param_rows.append(row_vals)

        pins = []
        groups = []
        site_count = DEFAULT_SITE_CNT
        
        # Find pins sheet
        pin_sheet_name = None
        for s in ['vi_source', 'pins', 'site']:
            for actual_name in wb.sheetnames:
                if actual_name.lower() == s:
                    pin_sheet_name = actual_name
                    break
            if pin_sheet_name:
                break
                
        if pin_sheet_name:
            sh_pins = wb[pin_sheet_name]
            rows = list(sh_pins.iter_rows(values_only=True))
            if rows:
                header = [str(c).strip() if c is not None else '' for c in rows[0]]
                site_cols = [i for i, h in enumerate(header) if re.match(r'^site\d+$', h, re.I)]
                if site_cols:
                    site_count = len(site_cols)
                    for r in rows[1:]:
                        if not r or r[0] is None or str(r[0]).strip() == '':
                            continue
                        pname = str(r[0]).strip()
                        ptype = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ''
                        sites = [str(r[c]).strip() if c < len(r) and r[c] is not None else '' for c in site_cols]
                        pins.append((pname, ptype, sites))
                else:
                    if len(rows[0]) > 1 and rows[0][1] is not None:
                        v = rows[0][1]
                        if isinstance(v, (int, float)) and v > 0:
                            site_count = int(v)

        if 'Groups' in wb.sheetnames:
            sh_g = wb['Groups']
            for r in list(sh_g.iter_rows(values_only=True))[1:]:
                if not r or r[0] is None or str(r[0]).strip() == '':
                    continue
                gname = str(r[0]).strip()
                gtype = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ''
                inc_str = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ''
                inc = [x.strip() for x in inc_str.split(',') if x.strip()]
                groups.append((gname, gtype, inc))

        # Find cbits sheet
        cbit_sheet_name = None
        for actual_name in wb.sheetnames:
            if actual_name.lower() in ['cbits', 'cbit', 'cbit_source', 'cbits_source']:
                cbit_sheet_name = actual_name
                break
        cbits_macros = []
        if cbit_sheet_name:
            sh_cb = wb[cbit_sheet_name]
            cb_rows = list(sh_cb.iter_rows(values_only=True))
            cbits_macros = parse_cbits_sheet_rows(cb_rows)
    else:
        raise ValueError(f"Unsupported format: {ext}")

    # Process
    if not pins:
        pins = DEFAULT_PINS
    if not groups:
        groups = DEFAULT_GROUPS

    # Process
    header_idx = -1
    for i, row in enumerate(param_rows):
        row_lower = [c.lower() for c in row if c]
        if 'param' in row_lower:
            header_idx = i
            break
    if header_idx == -1:
        header_idx = 0

    headers = [c.strip() for c in param_rows[header_idx]]
    col_map = {}
    for idx, h in enumerate(headers):
        h_clean = h.strip().lower()
        if h_clean in ['function', 'func']:
            col_map['function'] = idx
        elif h_clean in ['param', 'parameter']:
            col_map['param'] = idx
        elif h_clean in ['symbol']:
            col_map['symbol'] = idx
        elif h_clean in ['min', 'min_']:
            col_map['min'] = idx
        elif h_clean in ['max', 'max_']:
            col_map['max'] = idx
        elif h_clean in ['allunit', 'all_unit']:
            col_map['allunit'] = idx
        elif h_clean in ['unit']:
            col_map['unit'] = idx
        elif h_clean in ['format', 'fmt']:
            col_map['format'] = idx
        elif h_clean in ['subunit', 'sub_unit']:
            col_map['subunit'] = idx

    def get_col(r_vals, col_name, default=''):
        idx = col_map.get(col_name)
        if idx is not None and idx < len(r_vals):
            return str(r_vals[idx]).strip()
        return default

    current_func = ""
    current_params = []

    for r_idx in range(header_idx + 1, len(param_rows)):
        r_vals = param_rows[r_idx]
        if not any(r_vals):
            continue

        param_name = get_col(r_vals, 'param')
        if not param_name:
            continue

        func_val = get_col(r_vals, 'function')
        if func_val:
            if current_func:
                functions.append((current_func, current_params))
            current_func = func_val
            current_params = []
        elif not current_func:
            current_func = "TEST_DEFAULT"

        symbol = get_col(r_vals, 'symbol', param_name) or param_name
        min_val = get_col(r_vals, 'min')
        max_val = get_col(r_vals, 'max')
        unit = get_col(r_vals, 'unit')
        all_unit = get_col(r_vals, 'allunit', unit) or unit
        fmt = get_col(r_vals, 'format', '4') or '4'
        subunit = get_col(r_vals, 'subunit', '1') or '1'

        p_info = {
            'function': current_func,
            'is_func_start': bool(func_val),
            'param': param_name,
            'symbol': symbol,
            'min': min_val,
            'max': max_val,
            'all_unit': all_unit,
            'unit': unit,
            'format': fmt,
            'subunit': subunit,
            'row_idx': r_idx
        }
        all_params.append(p_info)
        current_params.append(p_info)

    if current_func and current_params:
        functions.append((current_func, current_params))

    return all_params, functions, pins, groups, site_count, cbits_macros


# ============================================================================
# PGS generation and MD5 calculation
# ============================================================================
def generate_pgs_content(project_name: str, all_params: List[Dict], site_count: int = 8, created_time: Optional[datetime.datetime] = None) -> bytes:
    if created_time is None:
        created_time = datetime.datetime.now()
    
    date_str = created_time.strftime("%Y-%m-%d %H:%M:%S")
    
    lines = [
        "[File Description Block]",
        "FileKey = 3084-1868",
        "MIN_VER = 2.0.1.0",
        "[Document Block]",
        f"strDllFileName = {project_name}.dll",
        "strDllFilePath = ",
        "iPgsVersion = 1006",
        f"strOrignDate = {date_str}",
        "strAdapter = ",
        "strDutName = ",
        'strComment = ""',
        "iUserStrCount = 0",
        "[QA Setting Block]",
        "strIsQAFile = 0",
        "StartFunctionNum = -1",
        "[Program Setting Block]",
        "ConHide = 1",
        "ConAdvanced = 1",
        "FunCheck = 0",
        "VSType = 2",
        f"sSiteCount = {site_count}",
        "PASSDUTTOFAILBIN = 1",
        "MustValue = 1",
        "TestNumType = 1",
        "TestNum_SubDiff = 1",
        "UserStrType = 1",
        "Last_Show_Row = 19",
        "ConditonUserEdit = 0,0,",
        "[Bin Setting Block]",
        "Count = 0",
        "Using = 0",
        "[Limit Setting Block]",
        "Count = 1",
        "Item = 0000,0000,0",
        "UserLimit = 0",
        "[FunCol Setting Block]",
        "Count = 15",
        "Item = 0,1,25,1,",
        "Item = 1,1,30,1,",
        "Item = 2,1,45,1,Test",
        "Item = 3,1,100,1,Function",
        "Item = 5,1,100,1,Param",
        "Item = 12,0,0,1,Result",
        "Item = 4,1,100,1,Symbol",
        "Item = 100,1,38,1,Min",
        "Item = 101,1,95,1,Max",
        "Item = 6,1,42,1,Unit",
        "Item = 7,1,67,1,Format",
        "Item = 8,1,73,1,SubUnit",
        "Item = 9,0,0,1,Show",
        "Item = 10,0,0,1,Save",
        "Item = 11,1,3082,1,Description",
        "[DataSheet Variable Block]",
        f"TestFunctionCount = {len(all_params)}"
    ]
    
    for p in all_params:
        if p['is_func_start']:
            fn = p['function']
            lines.append(f"FUNCTION = {len(fn):04d}{fn},1,1,0,0,0000,0000,")
        else:
            lines.append("FUNCTION = 0000,1,1,0,0,0000,0000,")
            
        param_name = p['param']
        symbol_name = p['symbol']
        f0 = f"{len(param_name):04d}{param_name}"
        f1 = f"{len(symbol_name):04d}{symbol_name}"
        f2 = "1"
        f3 = "1"
        f4 = str(p['format'])
        f5 = str(p['subunit'])
        f6 = "0"
        f7 = "0"
        f8 = "-1"
        f9 = "-1"
        f10 = "-1"
        f11 = "-1"
        f12 = "1"
        f13 = "1"
        
        unit = p['unit']
        unit_enc = f"{len(unit):04d}{unit}" if unit else "0000"
        f14 = f"{len(unit_enc) + 1:04d}{unit_enc}" if unit else "0000"
        f15 = ""
        f16 = unit_enc
        f17 = "0000"
        
        min_str = p['min']
        max_str = p['max']
        lmin = len(min_str)
        lmax = len(max_str)
        p2 = lmin + lmax + 10
        p1 = p2 + 8
        min_enc = f"{lmin:04d}{min_str}"
        max_enc = f"{lmax:04d}{max_str}"
        f18 = f"{p1:04d}{p2:04d}{min_enc}"
        f19 = max_enc
        f20 = ""
        f21 = "0"
        f22 = "0"
        f23 = "0000"
        f24 = "1"
        f25 = "0000"
        f26 = "00090000"
        f27 = "0000"
        f28 = "00060"
        f29 = "0"
        f30 = "0"
        f31 = ""
        f32 = ""
        
        fields = [
            f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13,
            f14, f15, f16, f17, f18, f19, f20, f21, f22, f23, f24, f25,
            f26, f27, f28, f29, f30, f31, f32
        ]
        lines.append("    " + ",".join(fields))

    lines.extend([
        "[Station Setting Block]",
        "ProgramType = 0",
        "StationCount = 0",
        "StationStatus = ",
        "StationInterval = ",
        "StationHWBin = ",
        "DummyBin = ",
        "InvalidDeviceBin = ",
        "DisableStation = 0",
        "SingleFristSOTType = 0",
        "SingleLastSOTType = 0",
        "EnableSettings=0",
        "StationSotError=0",
        "DisableSot=0",
        "EmptySot=0",
        "EnableStationSot=0",
        "[SWBinName Definition Block]",
        "count = 0",
        "[HWBinName Definition Block]",
        "count = 0",
        "[Bin Definition Block]",
        "Count = 3",
        "BINData = 1,1,2,0,",
        "BINData = 2,2,3,0,",
        "BINData = 32,32,4,0,",
        "[PAT Definition Block]",
        "PAT_Enable =1",
        "Continue =1",
        "SampleCount =100",
        "PATType =1",
        "PATCycle =10",
        "PATFrequency =1",
        "PATOldData =1",
        "EveryPartType =1",
        "Algorithm =2",
        "QuartileType =1",
        "PATUserDLL =0",
        "DLLName =",
        "PATN =0|4|4",
        "PASSBIN =1",
        "SamplePart =-1,-1",
        "PATPart =-1,-1",
        "SampleQA =0",
        "[Advanced Definition Block]",
        "Advanced = 0",
        "UserSetting = "
    ])
    
    body_text = "\r\n".join(lines) + "\r\n"
    body_bytes = body_text.encode('gbk')
    md5_hash = hashlib.md5(body_bytes + b"#AccoTEST Copyright\r\n").hexdigest().upper()
    
    final_text = body_text + f"[File MD5 Block]\r\nMD5 = {md5_hash}\n"
    return final_text.encode('gbk')


# ============================================================================
# C++ source and project template generation functions
# ============================================================================
def generate_main_cpp(project_name: str) -> str:
    lines = [
        f'// {project_name}.cpp : Defines the entry point for the DLL application.',
        '//',
        '',
        '#include "stdafx.h"',
        '',
        'BOOL APIENTRY DllMain( HANDLE hModule, ',
        '                       DWORD  ul_reason_for_call, ',
        '                       LPVOID lpReserved',
        '\t\t\t\t\t )',
        '{',
        '\tswitch (ul_reason_for_call)',
        '\t{',
        '\tcase DLL_PROCESS_ATTACH:',
        '\tcase DLL_THREAD_ATTACH:',
        '\t\tbreak;',
        '\tcase DLL_THREAD_DETACH:',
        '\tcase DLL_PROCESS_DETACH:',
        '\t\tbreak;',
        '    }',
        '\treturn TRUE;',
        '}',
        '//if needed, you can move the following functions to the file of test.cpp.',
        '//Do not change the definition of these functions, or the pgs can not be loaded.',
        'extern "C" int USERRES_API STSMaskTHBConfigCheck(bool maskFlag);/////clear EEPROM',
        '',
        'DUT_API void UserLoad()',
        '{		',
        '\tSTSMaskTHBConfigCheck(true);//clear EEPROM',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void UserInit()',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void UserExit()',
        '{		',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void OnSot()',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        '',
        'DUT_API void BinOutDut()',
        '{			',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void OnNewLot(const char *Lotid)',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void OnWaferEnd(const char *Lotid)',
        '{			',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        ''
    ]
    return "\r\n".join(lines)


def generate_stdafx_h() -> str:
    lines = [
        '// stdafx.h : include file for standard system include files,',
        '//  or project specific include files that are used frequently, but',
        '//      are changed infrequently',
        '//',
        '',
        '#if !defined(AFX_STDAFX_H__3811CD50_B7B0_42B9_9E73_805A91708537__INCLUDED_)',
        '#define AFX_STDAFX_H__3811CD50_B7B0_42B9_9E73_805A91708537__INCLUDED_',
        '',
        '#if _MSC_VER > 1000',
        '#pragma once',
        '#endif // _MSC_VER > 1000',
        '',
        '',
        '// Insert your headers here',
        '#define WIN32_LEAN_AND_MEAN		// Exclude rarely-used stuff from Windows headers',
        '#include <windows.h>',
        '',
        '#define DUT_API extern "C" __declspec(dllexport)',
        '#include <string>',
        '#include <iostream>',
        '#include <fstream>',
        'using namespace std;',
        '#include "usertype.h"',
        '#include "userres.h"',
        '',
        '',
        '// TODO: reference additional headers your program requires here',
        '',
        '//{{AFX_INSERT_LOCATION}}',
        '// Microsoft Visual C++ will insert additional declarations immediately before the previous line.',
        '',
        '#endif // !defined(AFX_STDAFX_H__3811CD50_B7B0_42B9_9E73_805A91708537__INCLUDED_)',
        ''
    ]
    return "\r\n".join(lines)


def generate_stdafx_cpp() -> str:
    lines = [
        '// stdafx.cpp : source file that includes just the standard includes',
        '//	DUT.pch will be the pre-compiled header',
        '//	stdafx.obj will contain the pre-compiled type information',
        '',
        '#include "stdafx.h"',
        '',
        '// TODO: reference any additional headers you need in STDAFX.H',
        '// and not in this file',
        ''
    ]
    return "\r\n".join(lines)


def generate_sln(project_name: str, guid_str: str) -> str:
    lines = [
        '',
        'Microsoft Visual Studio Solution File, Format Version 9.00',
        '# Visual C++ Express 2005',
        f'Project("{{8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942}}") = "{project_name}", "{project_name}.vcproj", "{guid_str}"',
        'EndProject',
        'Global',
        '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
        '\t\tDebug|Win32 = Debug|Win32',
        '\t\tRelease|Win32 = Release|Win32',
        '\tEndGlobalSection',
        '\tGlobalSection(ProjectConfigurationPlatforms) = postSolution',
        f'\t\t{guid_str}.Debug|Win32.ActiveCfg = Debug|Win32',
        f'\t\t{guid_str}.Debug|Win32.Build.0 = Debug|Win32',
        f'\t\t{guid_str}.Release|Win32.ActiveCfg = Release|Win32',
        f'\t\t{guid_str}.Release|Win32.Build.0 = Release|Win32',
        '\tEndGlobalSection',
        '\tGlobalSection(SolutionProperties) = preSolution',
        '\t\tHideSolutionNode = FALSE',
        '\tEndGlobalSection',
        'EndGlobal',
        ''
    ]
    return "\r\n".join(lines)


def generate_vcxproj(project_name: str, guid_str: str) -> str:
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Project DefaultTargets="Build" ToolsVersion="12.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        '  <ItemGroup Label="ProjectConfigurations">',
        '    <ProjectConfiguration Include="Debug|Win32">',
        '      <Configuration>Debug</Configuration>',
        '      <Platform>Win32</Platform>',
        '    </ProjectConfiguration>',
        '    <ProjectConfiguration Include="Release|Win32">',
        '      <Configuration>Release</Configuration>',
        '      <Platform>Win32</Platform>',
        '    </ProjectConfiguration>',
        '  </ItemGroup>',
        '  <PropertyGroup Label="Globals">',
        f'    <ProjectGuid>{guid_str}</ProjectGuid>',
        '  </PropertyGroup>',
        '  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />',
        '  <PropertyGroup Condition="\'$(Configuration)|$(Platform)\'==\'Release|Win32\'" Label="Configuration">',
        '    <ConfigurationType>DynamicLibrary</ConfigurationType>',
        '    <PlatformToolset>v120</PlatformToolset>',
        '    <UseOfMfc>false</UseOfMfc>',
        '    <CharacterSet>MultiByte</CharacterSet>',
        '  </PropertyGroup>',
        '  <PropertyGroup Condition="\'$(Configuration)|$(Platform)\'==\'Debug|Win32\'" Label="Configuration">',
        '    <ConfigurationType>DynamicLibrary</ConfigurationType>',
        '    <PlatformToolset>v120</PlatformToolset>',
        '    <UseOfMfc>false</UseOfMfc>',
        '    <CharacterSet>MultiByte</CharacterSet>',
        '  </PropertyGroup>',
        '  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.props" />',
        '  <ImportGroup Label="ExtensionSettings">',
        '  </ImportGroup>',
        '  <ImportGroup Condition="\'$(Configuration)|$(Platform)\'==\'Release|Win32\'" Label="PropertySheets">',
        '    <Import Project="$(UserRootDir)\\Microsoft.Cpp.$(Platform).user.props" Condition="exists(\'$(UserRootDir)\\Microsoft.Cpp.$(Platform).user.props\')" Label="LocalAppDataPlatform" />',
        '    <Import Project="$(VCTargetsPath)Microsoft.CPP.UpgradeFromVC60.props" />',
        '  </ImportGroup>',
        '  <ImportGroup Condition="\'$(Configuration)|$(Platform)\'==\'Debug|Win32\'" Label="PropertySheets">',
        '    <Import Project="$(UserRootDir)\\Microsoft.Cpp.$(Platform).user.props" Condition="exists(\'$(UserRootDir)\\Microsoft.Cpp.$(Platform).user.props\')" Label="LocalAppDataPlatform" />',
        '    <Import Project="$(VCTargetsPath)Microsoft.CPP.UpgradeFromVC60.props" />',
        '  </ImportGroup>',
        '  <PropertyGroup Label="UserMacros" />',
        '  <PropertyGroup>',
        '    <_ProjectFileVersion>12.0.30501.0</_ProjectFileVersion>',
        '  </PropertyGroup>',
        '  <PropertyGroup Condition="\'$(Configuration)|$(Platform)\'==\'Debug|Win32\'">',
        '    <OutDir>..\\</OutDir>',
        '    <IntDir>.\\debug\\</IntDir>',
        '    <LinkIncremental>true</LinkIncremental>',
        '  </PropertyGroup>',
        '  <PropertyGroup Condition="\'$(Configuration)|$(Platform)\'==\'Release|Win32\'">',
        '    <OutDir>..\\</OutDir>',
        '    <IntDir>.\\Release\\</IntDir>',
        '    <LinkIncremental>false</LinkIncremental>',
        '  </PropertyGroup>',
        '  <ItemDefinitionGroup Condition="\'$(Configuration)|$(Platform)\'==\'Debug|Win32\'">',
        '    <Midl>',
        '      <PreprocessorDefinitions>_DEBUG;%(PreprocessorDefinitions)</PreprocessorDefinitions>',
        '      <MkTypLibCompatible>true</MkTypLibCompatible>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        '      <TargetEnvironment>Win32</TargetEnvironment>',
        f'      <TypeLibraryName>.\\debug\\{project_name}.tlb</TypeLibraryName>',
        '      <HeaderFileName />',
        '    </Midl>',
        '    <ClCompile>',
        '      <Optimization>Disabled</Optimization>',
        '      <AdditionalIncludeDirectories>C:\\AccoTEST\\AccoTEST System\\INCLude;%(AdditionalIncludeDirectories)</AdditionalIncludeDirectories>',
        f'      <PreprocessorDefinitions>WIN32;_DEBUG;_WINDOWS;_USRDLL;{project_name}_EXPORTS;%(PreprocessorDefinitions)</PreprocessorDefinitions>',
        '      <MinimalRebuild>true</MinimalRebuild>',
        '      <BasicRuntimeChecks>EnableFastChecks</BasicRuntimeChecks>',
        '      <RuntimeLibrary>MultiThreadedDebug</RuntimeLibrary>',
        '      <PrecompiledHeader>NotUsing</PrecompiledHeader>',
        '      <AssemblerListingLocation>.\\debug\\</AssemblerListingLocation>',
        '      <ObjectFileName>.\\debug\\</ObjectFileName>',
        '      <ProgramDataBaseFileName>.\\debug\\</ProgramDataBaseFileName>',
        '      <WarningLevel>Level3</WarningLevel>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        '      <DebugInformationFormat>EditAndContinue</DebugInformationFormat>',
        '    </ClCompile>',
        '    <ResourceCompile>',
        '      <PreprocessorDefinitions>_DEBUG;%(PreprocessorDefinitions)</PreprocessorDefinitions>',
        '      <Culture>0x0804</Culture>',
        '    </ResourceCompile>',
        '    <Link>',
        '      <AdditionalDependencies>odbc32.lib;odbccp32.lib;UserRes.lib;UserType.lib;%(AdditionalDependencies)</AdditionalDependencies>',
        f'      <OutputFile>..\\{project_name}.dll</OutputFile>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        '      <AdditionalLibraryDirectories>C:\\AccoTEST\\AccoTEST System\\lIB;C:\\AccoTEST\\AccoTEST System\\INCLude;%(AdditionalLibraryDirectories)</AdditionalLibraryDirectories>',
        '      <GenerateDebugInformation>true</GenerateDebugInformation>',
        f'      <ProgramDatabaseFile>.\\debug\\{project_name}.pdb</ProgramDatabaseFile>',
        f'      <ImportLibrary>.\\debug\\{project_name}.lib</ImportLibrary>',
        '      <TargetMachine>MachineX86</TargetMachine>',
        '    </Link>',
        '    <Bscmake>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        f'      <OutputFile>.\\debug\\{project_name}.bsc</OutputFile>',
        '    </Bscmake>',
        '  </ItemDefinitionGroup>',
        '  <ItemDefinitionGroup Condition="\'$(Configuration)|$(Platform)\'==\'Release|Win32\'">',
        '    <Midl>',
        '      <PreprocessorDefinitions>NDEBUG;%(PreprocessorDefinitions)</PreprocessorDefinitions>',
        '      <MkTypLibCompatible>true</MkTypLibCompatible>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        '      <TargetEnvironment>Win32</TargetEnvironment>',
        f'      <TypeLibraryName>.\\Release\\{project_name}.tlb</TypeLibraryName>',
        '      <HeaderFileName />',
        '    </Midl>',
        '    <ClCompile>',
        '      <Optimization>MaxSpeed</Optimization>',
        '      <InlineFunctionExpansion>OnlyExplicitInline</InlineFunctionExpansion>',
        '      <AdditionalIncludeDirectories>C:\\AccoTEST\\AccoTEST System\\INCLude;%(AdditionalIncludeDirectories)</AdditionalIncludeDirectories>',
        f'      <PreprocessorDefinitions>WIN32;NDEBUG;_WINDOWS;_USRDLL;{project_name}_EXPORTS;%(PreprocessorDefinitions)</PreprocessorDefinitions>',
        '      <StringPooling>true</StringPooling>',
        '      <RuntimeLibrary>MultiThreaded</RuntimeLibrary>',
        '      <FunctionLevelLinking>true</FunctionLevelLinking>',
        '      <PrecompiledHeader>NotUsing</PrecompiledHeader>',
        '      <AssemblerListingLocation>.\\Release\\</AssemblerListingLocation>',
        '      <ObjectFileName>.\\Release\\</ObjectFileName>',
        '      <ProgramDataBaseFileName>.\\Release\\</ProgramDataBaseFileName>',
        '      <WarningLevel>Level3</WarningLevel>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        '    </ClCompile>',
        '    <ResourceCompile>',
        '      <PreprocessorDefinitions>NDEBUG;%(PreprocessorDefinitions)</PreprocessorDefinitions>',
        '      <Culture>0x0804</Culture>',
        '    </ResourceCompile>',
        '    <Link>',
        '      <AdditionalDependencies>odbc32.lib;odbccp32.lib;UserRes.lib;UserType.lib;%(AdditionalDependencies)</AdditionalDependencies>',
        f'      <OutputFile>..\\{project_name}.dll</OutputFile>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        '      <AdditionalLibraryDirectories>C:\\AccoTEST\\AccoTEST System\\lIB;C:\\AccoTEST\\AccoTEST System\\INCLude;%(AdditionalLibraryDirectories)</AdditionalLibraryDirectories>',
        f'      <ProgramDatabaseFile>.\\Release\\{project_name}.pdb</ProgramDatabaseFile>',
        f'      <ImportLibrary>.\\Release\\{project_name}.lib</ImportLibrary>',
        '      <TargetMachine>MachineX86</TargetMachine>',
        '    </Link>',
        '    <Bscmake>',
        '      <SuppressStartupBanner>true</SuppressStartupBanner>',
        f'      <OutputFile>.\\Release\\{project_name}.bsc</OutputFile>',
        '    </Bscmake>',
        '  </ItemDefinitionGroup>',
        '  <ItemGroup>',
        '    <ClCompile Include="StdAfx.cpp" />',
        f'    <ClCompile Include="{project_name}.cpp" />',
        '    <ClCompile Include="inireader.cpp" />',
        '    <ClCompile Include="test.cpp" />',
        '    <ClCompile Include="treg.cpp" />',
        '  </ItemGroup>',
        '  <ItemGroup>',
        '    <ClInclude Include="StdAfx.h" />',
        '    <ClInclude Include="inireader.h" />',
        '    <ClInclude Include="Pin_Channel_define.h" />',
        '    <ClInclude Include="test_method.h" />',
        '    <ClInclude Include="treg.h" />',
        '  </ItemGroup>',
        '  <ItemGroup>',
        '    <Text Include="ReadMe.txt" />',
        '  </ItemGroup>',
        '  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />',
        '  <ImportGroup Label="ExtensionTargets">',
        '  </ImportGroup>',
        '</Project>',
        ''
    ]
    return "\r\n".join(lines)


def generate_vcxproj_filters(project_name: str) -> str:
    g1 = str(uuid.uuid4())
    g2 = str(uuid.uuid4())
    g3 = str(uuid.uuid4())
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Project ToolsVersion="4.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        '<ItemGroup>',
        '<Filter Include="Source Files">',
        f'<UniqueIdentifier>{{{g1}}}</UniqueIdentifier>',
        '<Extensions>cpp;c;cxx;rc;def;r;odl;idl;hpj;bat</Extensions>',
        '</Filter>',
        '<Filter Include="Header Files">',
        f'<UniqueIdentifier>{{{g2}}}</UniqueIdentifier>',
        '<Extensions>h;hpp;hxx;hm;inl</Extensions>',
        '</Filter>',
        '<Filter Include="Resource Files">',
        f'<UniqueIdentifier>{{{g3}}}</UniqueIdentifier>',
        '<Extensions>ico;cur;bmp;dlg;rc2;rct;bin;rgs;gif;jpg;jpeg;jpe</Extensions>',
        '</Filter>',
        '</ItemGroup>',
        '<ItemGroup>',
        '<ClCompile Include="StdAfx.cpp">',
        '<Filter>Source Files</Filter>',
        '</ClCompile>',
        f'<ClCompile Include="{project_name}.cpp">',
        '<Filter>Source Files</Filter>',
        '</ClCompile>',
        '<ClCompile Include="inireader.cpp">',
        '<Filter>Source Files</Filter>',
        '</ClCompile>',
        '<ClCompile Include="test.cpp">',
        '<Filter>Source Files</Filter>',
        '</ClCompile>',
        '<ClCompile Include="treg.cpp">',
        '<Filter>Source Files</Filter>',
        '</ClCompile>',
        '</ItemGroup>',
        '<ItemGroup>',
        '<ClInclude Include="StdAfx.h">',
        '<Filter>Header Files</Filter>',
        '</ClInclude>',
        '<ClInclude Include="inireader.h">',
        '<Filter>Header Files</Filter>',
        '</ClInclude>',
        '<ClInclude Include="Pin_Channel_define.h">',
        '<Filter>Header Files</Filter>',
        '</ClInclude>',
        '<ClInclude Include="test_method.h">',
        '<Filter>Header Files</Filter>',
        '</ClInclude>',
        '<ClInclude Include="treg.h">',
        '<Filter>Header Files</Filter>',
        '</ClInclude>',
        '</ItemGroup>',
        '<ItemGroup>',
        '<Text Include="ReadMe.txt"/>',
        '</ItemGroup>',
        '</Project>',
        ''
    ]
    return "\r\n".join(lines)


def generate_vcproj(project_name: str, guid_str: str) -> str:
    lines = [
        '<?xml version="1.0" encoding="gb2312"?>',
        '<VisualStudioProject',
        '\tProjectType="Visual C++"',
        '\tVersion="8.00"',
        f'\tName="{project_name}"',
        f'\tProjectGUID="{guid_str}"',
        '\t>',
        '\t<Platforms>',
        '\t\t<Platform',
        '\t\t\tName="Win32"',
        '\t\t/>',
        '\t</Platforms>',
        '\t<ToolFiles>',
        '\t</ToolFiles>',
        '\t<Configurations>',
        '\t\t<Configuration',
        '\t\t\tName="Debug|Win32"',
        '\t\t\tOutputDirectory=".\\debug"',
        '\t\t\tIntermediateDirectory=".\\debug"',
        '\t\t\tConfigurationType="2"',
        '\t\t\tInheritedPropertySheets="$(VCInstallDir)VCProjectDefaults\\UpgradeFromVC60.vsprops"',
        '\t\t\tUseOfMFC="0"',
        '\t\t\tATLMinimizesCRunTimeLibraryUsage="false"',
        '\t\t\tCharacterSet="2"',
        '\t\t\t>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCPreBuildEventTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCCustomBuildTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCXMLDataGeneratorTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCWebServiceProxyGeneratorTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCMIDLTool"',
        '\t\t\t\tPreprocessorDefinitions="_DEBUG"',
        '\t\t\t\tMkTypLibCompatible="true"',
        '\t\t\t\tSuppressStartupBanner="true"',
        '\t\t\t\tTargetEnvironment="1"',
        f'\t\t\t\tTypeLibraryName="{project_name}.tlb"',
        '\t\t\t\tHeaderFileName=""',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCCLCompilerTool"',
        '\t\t\t\tOptimization="0"',
        '\t\t\t\tAdditionalIncludeDirectories="C:\\AccoTEST\\AccoTEST System\\INCLude;"',
        f'\t\t\t\tPreprocessorDefinitions="WIN32;_DEBUG;_WINDOWS;_USRDLL;{project_name}_EXPORTS"',
        '\t\t\t\tMinimalRebuild="true"',
        '\t\t\t\tBasicRuntimeChecks="3"',
        '\t\t\t\tRuntimeLibrary="1"',
        '\t\t\t\tUsePrecompiledHeader="0"',
        '\t\t\t\tAssemblerListingLocation=".\\debug/"',
        '\t\t\t\tObjectFile=".\\debug/"',
        '\t\t\t\tProgramDataBaseFileName=".\\debug/"',
        '\t\t\t\tWarningLevel="3"',
        '\t\t\t\tSuppressStartupBanner="true"',
        '\t\t\t\tDebugInformationFormat="4"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCManagedResourceCompilerTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCResourceCompilerTool"',
        '\t\t\t\tPreprocessorDefinitions="_DEBUG"',
        '\t\t\t\tCulture="2052"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCPreLinkEventTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCLinkerTool"',
        '\t\t\t\tAdditionalDependencies="odbc32.lib odbccp32.lib UserRes.lib UserType.lib"',
        f'\t\t\t\tOutputFile="..\\{project_name}.dll"',
        '\t\t\t\tLinkIncremental="2"',
        '\t\t\t\tSuppressStartupBanner="true"',
        '\t\t\t\tAdditionalLibraryDirectories="C:\\AccoTEST\\AccoTEST System\\lIB;"',
        '\t\t\t\tGenerateDebugInformation="true"',
        f'\t\t\t\tProgramDatabaseFile=".\\debug\\{project_name}.pdb"',
        f'\t\t\t\tImportLibrary=".\\debug\\{project_name}.lib"',
        '\t\t\t\tTargetMachine="1"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCALinkTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCManifestTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCXDCMakeTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCBscMakeTool"',
        '\t\t\t\tSuppressStartupBanner="true"',
        f'\t\t\t\tOutputFile="{project_name}.bsc"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCFxCopTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCAppVerifierTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCWebDeploymentTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCPostBuildEventTool"',
        '\t\t\t/>',
        '\t\t</Configuration>',
        '\t\t<Configuration',
        '\t\t\tName="Release|Win32"',
        '\t\t\tOutputDirectory=".\\Release"',
        '\t\t\tIntermediateDirectory=".\\Release"',
        '\t\t\tConfigurationType="2"',
        '\t\t\tInheritedPropertySheets="$(VCInstallDir)VCProjectDefaults\\UpgradeFromVC60.vsprops"',
        '\t\t\tUseOfMFC="0"',
        '\t\t\tATLMinimizesCRunTimeLibraryUsage="false"',
        '\t\t\tCharacterSet="2"',
        '\t\t\t>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCPreBuildEventTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCCustomBuildTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCXMLDataGeneratorTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCWebServiceProxyGeneratorTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCMIDLTool"',
        '\t\t\t\tPreprocessorDefinitions="NDEBUG"',
        '\t\t\t\tMkTypLibCompatible="true"',
        '\t\t\t\tSuppressStartupBanner="true"',
        '\t\t\t\tTargetEnvironment="1"',
        f'\t\t\t\tTypeLibraryName="{project_name}.tlb"',
        '\t\t\t\tHeaderFileName=""',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCCLCompilerTool"',
        '\t\t\t\tOptimization="2"',
        '\t\t\t\tInlineFunctionExpansion="1"',
        '\t\t\t\tAdditionalIncludeDirectories="C:\\AccoTEST\\AccoTEST System\\INCLude;"',
        f'\t\t\t\tPreprocessorDefinitions="WIN32;NDEBUG;_WINDOWS;_USRDLL;{project_name}_EXPORTS"',
        '\t\t\t\tStringPooling="true"',
        '\t\t\t\tRuntimeLibrary="0"',
        '\t\t\t\tEnableFunctionLevelLinking="true"',
        '\t\t\t\tUsePrecompiledHeader="0"',
        '\t\t\t\tAssemblerListingLocation=".\\Release/"',
        '\t\t\t\tObjectFile=".\\Release/"',
        '\t\t\t\tProgramDataBaseFileName=".\\Release/"',
        '\t\t\t\tWarningLevel="3"',
        '\t\t\t\tSuppressStartupBanner="true"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCManagedResourceCompilerTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCResourceCompilerTool"',
        '\t\t\t\tPreprocessorDefinitions="NDEBUG"',
        '\t\t\t\tCulture="2052"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCPreLinkEventTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCLinkerTool"',
        '\t\t\t\tAdditionalDependencies="odbc32.lib odbccp32.lib UserRes.lib UserType.lib"',
        f'\t\t\t\tOutputFile="..\\{project_name}.dll"',
        '\t\t\t\tLinkIncremental="1"',
        '\t\t\t\tSuppressStartupBanner="true"',
        '\t\t\t\tAdditionalLibraryDirectories="C:\\AccoTEST\\AccoTEST System\\lIB;"',
        f'\t\t\t\tProgramDatabaseFile=".\\Release\\{project_name}.pdb"',
        f'\t\t\t\tImportLibrary=".\\Release\\{project_name}.lib"',
        '\t\t\t\tTargetMachine="1"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCALinkTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCManifestTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCXDCMakeTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCBscMakeTool"',
        '\t\t\t\tSuppressStartupBanner="true"',
        f'\t\t\t\tOutputFile="{project_name}.bsc"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCFxCopTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCAppVerifierTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCWebDeploymentTool"',
        '\t\t\t/>',
        '\t\t\t<Tool',
        '\t\t\t\tName="VCPostBuildEventTool"',
        '\t\t\t/>',
        '\t\t</Configuration>',
        '\t</Configurations>',
        '\t<References>',
        '\t</References>',
        '\t<Files>',
        '\t\t<Filter',
        '\t\t\tName="Source Files"',
        '\t\t\tFilter="cpp;c;cxx;rc;def;r;odl;idl;hpj;bat"',
        '\t\t\t>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="StdAfx.cpp"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        f'\t\t\t\tRelativePath="{project_name}.cpp"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="inireader.cpp"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="test.cpp"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="treg.cpp"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t</Filter>',
        '\t\t<Filter',
        '\t\t\tName="Header Files"',
        '\t\t\tFilter="h;hpp;hxx;hm;inl"',
        '\t\t\t>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="StdAfx.h"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="inireader.h"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="Pin_Channel_define.h"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="test_method.h"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t\t<File',
        '\t\t\t\tRelativePath="treg.h"',
        '\t\t\t\t>',
        '\t\t\t</File>',
        '\t\t</Filter>',
        '\t\t<Filter',
        '\t\t\tName="Resource Files"',
        '\t\t\tFilter="ico;cur;bmp;dlg;rc2;rct;bin;rgs;gif;jpg;jpeg;jpe"',
        '\t\t\t>',
        '\t\t</Filter>',
        '\t\t<File',
        '\t\t\tRelativePath="ReadMe.txt"',
        '\t\t\t>',
        '\t\t</File>',
        '\t</Files>',
        '\t<Globals>',
        '\t</Globals>',
        '</VisualStudioProject>',
        ''
    ]
    return "\r\n".join(lines)


def generate_dsp(project_name: str) -> str:
    lines = [
        f'# Microsoft Developer Studio Project File - Name="{project_name}" - Package Owner=<4>',
        '# Microsoft Developer Studio Generated Build File, Format Version 6.00',
        '# ** DO NOT EDIT **',
        '',
        '# TARGTYPE "Win32 (x86) Dynamic-Link Library" 0x0102',
        '',
        f'CFG={project_name} - Win32 Debug',
        '!MESSAGE This is not a valid makefile. To build this project using NMAKE,',
        '!MESSAGE use the Export Makefile command and run',
        '!MESSAGE ',
        f'!MESSAGE NMAKE /f "{project_name}.mak".',
        '!MESSAGE ',
        '!MESSAGE You can specify a configuration when running NMAKE',
        '!MESSAGE by defining the macro CFG on the command line. For example:',
        '!MESSAGE ',
        f'!MESSAGE NMAKE /f "{project_name}.mak" CFG="DUT - Win32 Debug"',
        '!MESSAGE ',
        '!MESSAGE Possible choices for configuration are:',
        '!MESSAGE ',
        f'!MESSAGE "{project_name} - Win32 Release" (based on "Win32 (x86) Dynamic-Link Library")',
        f'!MESSAGE "{project_name} - Win32 Debug" (based on "Win32 (x86) Dynamic-Link Library")',
        '!MESSAGE ',
        '',
        '# Begin Project',
        '# PROP AllowPerConfigDependencies 0',
        '# PROP Scc_ProjName ""',
        '# PROP Scc_LocalPath ""',
        'CPP=cl.exe',
        'MTL=midl.exe',
        'RSC=rc.exe',
        '',
        f'!IF  "$(CFG)" == "{project_name} - Win32 Release"',
        '',
        '# PROP BASE Use_MFC 0',
        '# PROP BASE Use_Debug_Libraries 0',
        '# PROP BASE Output_Dir "Release"',
        '# PROP BASE Intermediate_Dir "Release"',
        '# PROP BASE Target_Dir ""',
        '# PROP Use_MFC 0',
        '# PROP Use_Debug_Libraries 0',
        '# PROP Output_Dir "Release"',
        '# PROP Intermediate_Dir "Release"',
        '# PROP Ignore_Export_Lib 0',
        '# PROP Target_Dir ""',
        '# ADD LINK32 /libpath:"C:\\AccoTEST\\AccoTEST System\\lIB"',
        '# ADD CPP /nologo /I "C:\\AccoTEST\\AccoTEST System\\INCLude"',
        '# ADD LINK32 ',
        '# ADD CPP /nologo ',
        f'# ADD BASE CPP /nologo /MT /W3 /GX /O2 /D "WIN32" /D "NDEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "{project_name}_EXPORTS" /Yu"stdafx.h" /FD /c',
        f'# ADD CPP /nologo /MT /W3 /GX /O2  /D "WIN32" /D "NDEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "{project_name}_EXPORTS" /Yu"stdafx.h" /FD /c',
        '# ADD BASE MTL /nologo /D "NDEBUG" /mktyplib203 /win32',
        '# ADD MTL /nologo /D "NDEBUG" /mktyplib203 /win32',
        '# ADD BASE RSC /l 0x804 /d "NDEBUG"',
        '# ADD RSC /l 0x804 /d "NDEBUG"',
        'BSC32=bscmake.exe',
        '# ADD BASE BSC32 /nologo',
        '# ADD BSC32 /nologo',
        'LINK32=link.exe',
        '# ADD BASE LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /dll /machine:I386',
        f'# ADD LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib UserRes.lib UserType.lib /nologo /dll /machine:I386 /out:"../{project_name}.dll" ',
        '',
        f'!ELSEIF  "$(CFG)" == "{project_name} - Win32 Debug"',
        '',
        '# PROP BASE Use_MFC 0',
        '# PROP BASE Use_Debug_Libraries 1',
        '# PROP BASE Output_Dir "Debug"',
        '# PROP BASE Intermediate_Dir "Debug"',
        '# PROP BASE Target_Dir ""',
        '# PROP Use_MFC 0',
        '# PROP Use_Debug_Libraries 1',
        '# PROP Output_Dir "debug"',
        '# PROP Intermediate_Dir "debug"',
        '# PROP Ignore_Export_Lib 0',
        '# PROP Target_Dir ""',
        '# ADD LINK32 /libpath:"C:\\AccoTEST\\AccoTEST System\\lIB"',
        '# ADD CPP /nologo /I "C:\\AccoTEST\\AccoTEST System\\INCLude"',
        '# ADD LINK32 ',
        '# ADD CPP /nologo ',
        f'# ADD BASE CPP /nologo /MTd /W3 /Gm /GX /ZI /Od /D "WIN32" /D "_DEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "{project_name}_EXPORTS" /Yu"stdafx.h" /FD /GZ /c',
        f'# ADD CPP /nologo /MTd /W3 /Gm /GX /ZI /Od  /D "WIN32" /D "_DEBUG" /D "_WINDOWS" /D "_MBCS" /D "_USRDLL" /D "{project_name}_EXPORTS" /Yu"stdafx.h" /FD /GZ /c',
        '# ADD BASE MTL /nologo /D "_DEBUG" /mktyplib203 /win32',
        '# ADD MTL /nologo /D "_DEBUG" /mktyplib203 /win32',
        '# ADD BASE RSC /l 0x804 /d "_DEBUG"',
        '# ADD RSC /l 0x804 /d "_DEBUG"',
        'BSC32=bscmake.exe',
        '# ADD BASE BSC32 /nologo',
        '# ADD BSC32 /nologo',
        'LINK32=link.exe',
        '# ADD BASE LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /dll /debug /machine:I386 /pdbtype:sept',
        f'# ADD LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib UserRes.lib UserType.lib /nologo /dll /debug /machine:I386 /out:"../{project_name}.dll" /pdbtype:sept ',
        '# SUBTRACT LINK32 /pdb:none',
        '',
        '!ENDIF ',
        '',
        '# Begin Target',
        '',
        f'# Name "{project_name} - Win32 Release"',
        f'# Name "{project_name} - Win32 Debug"',
        '# Begin Group "Source Files"',
        '',
        '# PROP Default_Filter "cpp;c;cxx;rc;def;r;odl;idl;hpj;bat"',
        '# Begin Source File',
        '',
        f'SOURCE=.\\{project_name}.cpp',
        '# End Source File',
        '# Begin Source File',
        '',
        'SOURCE=.\\StdAfx.cpp',
        '# ADD CPP /Yc"stdafx.h"',
        '# End Source File',
        '# Begin Source File',
        '',
        'SOURCE=.\\test.cpp',
        '# End Source File',
        '# End Group',
        '# Begin Group "Header Files"',
        '',
        '# PROP Default_Filter "h;hpp;hxx;hm;inl"',
        '# Begin Source File',
        '',
        'SOURCE=.\\StdAfx.h',
        '# End Source File',
        '# End Group',
        '# Begin Group "Resource Files"',
        '',
        '# PROP Default_Filter "ico;cur;bmp;dlg;rc2;rct;bin;rgs;gif;jpg;jpeg;jpe"',
        '# End Group',
        '# Begin Source File',
        '',
        'SOURCE=.\\ReadMe.txt',
        '# End Source File',
        '# End Target',
        '# End Project',
        ''
    ]
    return "\r\n".join(lines)


def generate_dsw(project_name: str) -> str:
    lines = [
        'Microsoft Developer Studio Workspace File, Format Version 6.00',
        '# WARNING: DO NOT EDIT OR DELETE THIS WORKSPACE FILE!',
        '',
        '###############################################################################',
        '',
        f'Project: "{project_name}"=".\\{project_name}.dsp" - Package Owner=<4>',
        '',
        'Package=<5>',
        '{{{',
        '}}}',
        '',
        'Package=<4>',
        '{{{',
        '}}}',
        '',
        '###############################################################################',
        '',
        'Global:',
        '',
        'Package=<5>',
        '{{{',
        '}}}',
        '',
        'Package=<3>',
        '{{{',
        '}}}',
        '',
        '###############################################################################',
        '',
        ''
    ]
    return "\r\n".join(lines)


# ============================================================================
# Pin_Channel_define.h & PinPlanner code generation functions
# ============================================================================
def gen_pin_channel_define(pins: List, groups: List, site_count: int = 8) -> str:
    pin_names = [p[0] for p in pins]
    L = []
    L.append('//Pin_Channel_define.h : Channel string for pin or site bind')
    L.append('#pragma once')
    L.append('//Generated automatically - do not edit manually')
    L.append('#ifndef _PIN_CHANNEL_DEFINE_MIGRATE')
    L.append('#define _PIN_CHANNEL_DEFINE_MIGRATE')
    for name, typ, sites in pins:
# Ensure sites length matches site_count
        actual_sites = (sites + [''] * site_count)[:site_count]
        L.append(f'#define _PIN_CHANNEL_DEFINE_{name}_  "{",".join(actual_sites)}"')
    for gname, gtyp, inc in groups:
        chans = []
        for p in inc:
            if p in pin_names:
                p_sites = pins[pin_names.index(p)][2]
                actual_sites = (p_sites + [''] * site_count)[:site_count]
                chans.extend(actual_sites)
        L.append(f'#define _GROUP_CHANNEL_DEFINE_{gname}_  "{",".join(chans)}"')
    types = sorted(set(p[1] for p in pins if p[1]))
    for typ in types:
        md = MD_MAP.get(typ, 'MD_' + typ)
        tpins = [p for p in pins if p[1] == typ]
        for si in range(site_count):
            chans = [(tpins[k][2][si] if si < len(tpins[k][2]) else '') for k in range(len(tpins))]
            L.append(f'#define _PIN_SITE_BIND_DEFINE_{md}_SITE{si + 1}_  "{",".join(chans)}"')
    for name, typ, sites in pins:
        if typ:
            L.append(f'extern {typ} {name};')
    for gname, gtyp, inc in groups:
        if gtyp:
            L.append(f'extern {gtyp} {gname};')
    L.append('#endif//!_PIN_CHANNEL_DEFINE_MIGRATE')
    return '\r\n'.join(L) + '\r\n'


def gen_pinplanner_block(pins: List, groups: List, site_count: int = 8) -> str:
    L = []
    L.append('/****STS_PINPLANNER_CODE_BEGIN****/')
    L.append(f'#define STS_SITE_NUM {site_count}')
    L.append('/****PIN GROUP DEFINITION****/')
    for name, typ, sites in pins:
        if typ:
            L.append(f'{typ} {name}(_PIN_CHANNEL_DEFINE_{name}_, "{name}");')
    for gname, gtyp, inc in groups:
        if gtyp:
            L.append(f'{gtyp} {gname}(_GROUP_CHANNEL_DEFINE_{gname}_,"{gname}");')
    L.append('/****multisite settings should be included here****/')
    L.append('DUT_API void HardWareCfg()')
    L.append('{')
    types = sorted(set(p[1] for p in pins if p[1]))
    for typ in types:
        md = MD_MAP.get(typ, 'MD_' + typ)
        for si in range(site_count):
            L.append(f'\tSTSSetMultiSiteBindEx({md},{si},_PIN_SITE_BIND_DEFINE_{md}_SITE{si + 1}_);')
    L.append('}')
    L.append('/****STS_PINPLANNER_CODE_END****/')
    return '\r\n'.join(L) + '\r\n'


def generate_initial_test_cpp(functions: List[Tuple[str, List[Dict]]]) -> str:
    lines = [
        '#include "stdafx.h"',
        '',
        'DUT_API void HardWareCfg()',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void InitBeforeTestFlow()',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void InitAfterTestFlow()',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        'DUT_API void SetupFailSite(const unsigned char*byFailSite)',
        '{',
        '}',
        '/************************************************************************/',
        '/*                                                                      */',
        '/************************************************************************/',
        ' '
    ]

    for func_name, params in functions:
        lines.append(f'DUT_API int {func_name}(short funcindex, LPCTSTR funclabel)')
        lines.append('{')
        lines.append('    //{{AFX_STS_PARAM_PROTOTYPES')
        for p in params:
            param_name = p['param']
            lines.append(f'    CParam *{param_name} = StsGetParam(funcindex, "{param_name}");')
        lines.append('    //}}AFX_STS_PARAM_PROTOTYPES')
        lines.append('    // TODO: Add your function code here')
        lines.append('    return 0;')
        lines.append('}')
        lines.append(' ')

    return "\r\n".join(lines)


# ============================================================================
# Treg Parser & Generator (Trim_reg Excel sheet to .treg configuration)
# ============================================================================
def clean_param_name(name: str) -> str:
    """Clean parameter name by replacing whitespace and hyphens with underscores."""
    name = str(name).strip()
    name = re.sub(r'[\s\-]+', '_', name)
    return name


def is_dummy(s: Optional[str]) -> bool:
    """Check if cell represents a dummy, reserved, or empty placeholder."""
    if s is None:
        return True
    s_clean = str(s).strip()
    if not s_clean:
        return True
    u = s_clean.upper()
    if u == 'RESERVED' or u.startswith('RESERVED') or u == 'NC' or u.startswith('NC'):
        return True
    if u == 'DUMMY' or u.startswith('DUMMY') or u.startswith('F_DUMMY') or u == 'F_AON_DUM':
        return True
    return False


def generate_table_str(bit_count: int) -> str:
    """Generate Table string for 2^N entries (e.g. *1,2,3,4,5,6,7,8)."""
    num_entries = 1 << bit_count
    return '*' + ','.join(str(i) for i in range(1, num_entries + 1))


def get_treg_template_headers(template_path: str = "template.treg") -> Tuple[str, str, str, str]:
    """Extract standard comments and section headers from template.treg."""
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        idx_p = text.find("[Trim_BGR_VREF]")
        sec1 = text[:idx_p].strip() if idx_p != -1 else ""
        bf_start = text.find("; ============================== Bit Fields")
        bw_start = text.find("; ==============================  Build Words")
        sec2 = text[bf_start:bw_start].strip() if (bf_start != -1 and bw_start != -1) else ""
        rg_start = text.find("; =============================  Register Groups")
        idx_otp = text.find("[_OTP_")
        sec3 = text[bw_start:idx_otp].strip() if (bw_start != -1 and idx_otp != -1) else ""
        idx_rg = text.find("[#OTP_Cell]")
        sec4 = text[rg_start:idx_rg].strip() if (rg_start != -1 and idx_rg != -1) else ""
        return sec1, sec2, sec3, sec4

    sec1 = """; =============================================================================
; ============================== TRIM PARAMETER  ==============================
; ============================================================================="""
    sec2 = """; =============================================================================
; ============================== Bit Fields ===================================
; =============================================================================
[*GENERAL]
Fill_0\t\t\t\t= 0
Fill_1\t\t\t\t= 1
Dummy\t\t\t\t= 0 ;  

Fill_0x42 = 0x00"""
    sec3 = """; =============================================================================
; ==============================  Build Words  ================================
; ============================================================================="""
    sec4 = """; =============================================================================
; =============================  Register Groups  =============================
; ============================================================================="""
    return sec1, sec2, sec3, sec4


def parse_trim_reg_sheet(ws) -> Tuple[List[dict], Dict[str, Set[int]], List[str]]:
    """Parse Trim_reg sheet using openpyxl worksheet."""
    merged_map = {}
    for rng in ws.merged_cells.ranges:
        top_left_val = ws.cell(rng.min_row, rng.min_col).value
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                merged_map[(r, c)] = (rng.min_row, rng.min_col, rng.max_row, rng.max_col, top_left_val)

    table_header_rows = []
    for r in range(1, ws.max_row + 1):
        val = ws.cell(r, 1).value
        if val and 'address' in str(val).strip().lower():
            table_header_rows.append(r)

    if not table_header_rows:
        return [], {}, []

    registers = []
    trim_params: Dict[str, Set[int]] = {}
    param_order: List[str] = []

    def add_param_bit(p_name: str, p_bit: int):
        if p_name == 'Dummy':
            return
        if p_name not in trim_params:
            trim_params[p_name] = set()
            param_order.append(p_name)
        trim_params[p_name].add(p_bit)

    for t_idx, start_r in enumerate(table_header_rows):
        end_r = table_header_rows[t_idx + 1] - 1 if t_idx + 1 < len(table_header_rows) else ws.max_row

        col_to_bit = {}
        for c in range(2, ws.max_column + 1):
            hval = ws.cell(start_r, c).value
            if hval:
                m = re.search(r'D(\d+)', str(hval), re.IGNORECASE)
                if m:
                    col_to_bit[c] = int(m.group(1))

        if not col_to_bit:
            continue

        num_bits = max(col_to_bit.values()) + 1

        for r in range(start_r + 1, end_r + 1):
            addr_val = ws.cell(r, 1).value
            if not addr_val:
                continue
            addr_str = str(addr_val).strip()

            if not (addr_str.lower().startswith('0x') or re.match(r'^[0-9A-Fa-f]+$', addr_str)):
                continue

            if not addr_str.lower().startswith('0x'):
                norm_addr = '0x' + addr_str.upper()
            else:
                norm_addr = '0x' + addr_str[2:].upper()

            reg_bits = {b: ('Dummy', 0) for b in range(num_bits)}
            processed_cols = set()

            for c in range(2, ws.max_column + 1):
                if c not in col_to_bit or c in processed_cols:
                    continue

                if (r, c) in merged_map:
                    min_r, min_c, max_r, max_c, val = merged_map[(r, c)]
                    for cc in range(min_c, max_c + 1):
                        processed_cols.add(cc)
                else:
                    min_c = max_c = c
                    val = ws.cell(r, c).value
                    processed_cols.add(c)

                if is_dummy(val):
                    continue

                s = str(val).strip()

                m_range = re.match(r'^(.*?)[\[\<](\d+)\s*[:：]\s*(\d+)[\]\>]$', s)
                m_single = re.match(r'^(.*?)[\[\<](\d+)[\]\>]$', s)

                if m_range:
                    base_name = clean_param_name(m_range.group(1))
                    msb = int(m_range.group(2))
                    lsb = int(m_range.group(3))
                    for cc in range(min_c, max_c + 1):
                        if cc in col_to_bit:
                            b_idx = col_to_bit[cc]
                            p_bit = lsb + (max_c - cc)
                            reg_bits[b_idx] = (base_name, p_bit)
                            add_param_bit(base_name, p_bit)
                elif m_single:
                    base_name = clean_param_name(m_single.group(1))
                    p_bit = int(m_single.group(2))
                    for cc in range(min_c, max_c + 1):
                        if cc in col_to_bit:
                            b_idx = col_to_bit[cc]
                            reg_bits[b_idx] = (base_name, p_bit)
                            add_param_bit(base_name, p_bit)
                else:
                    base_name = clean_param_name(s)
                    for cc in range(min_c, max_c + 1):
                        if cc in col_to_bit:
                            b_idx = col_to_bit[cc]
                            p_bit = max_c - cc
                            reg_bits[b_idx] = (base_name, p_bit)
                            add_param_bit(base_name, p_bit)

            registers.append({
                'address': norm_addr,
                'num_bits': num_bits,
                'bits': reg_bits
            })

    return registers, trim_params, param_order


def generate_treg_content(registers: List[dict],
                          trim_params: Dict[str, Set[int]],
                          param_order: List[str],
                          template_path: str = "template.treg") -> str:
    """Generate complete .treg text content."""
    sec1, sec2, sec3, sec4 = get_treg_template_headers(template_path)
    lines = []

    if sec1:
        lines.append(sec1)
        lines.append("")

    for p_name in param_order:
        bits = trim_params.get(p_name, set())
        bit_count = max(bits) + 1 if bits else 1
        table_str = generate_table_str(bit_count)

        lines.append(f"[{p_name}]")
        lines.append("Target         \t\t= 1.0 V \t\t")
        lines.append("Trim_type      \t\t= nom")
        lines.append(f"Table               = {table_str}")
        lines.append("Trim_start_learn    = 40")
        lines.append("Trim_step_learn     = 40")
        lines.append("Trim_step_char      = 40")
        lines.append("")

    if sec2:
        lines.append(sec2)
        lines.append("")

    if sec3:
        lines.append(sec3)
        lines.append("")

    for reg in registers:
        addr = reg['address']
        num_bits = reg['num_bits']
        bits_map = reg['bits']

        lines.append(f"[_OTP_{addr}]")
        for b in range(num_bits):
            p_name, p_bit = bits_map.get(b, ('Dummy', 0))
            lines.append(f"{b}:\t{p_name:<30} = {p_bit}")
        lines.append("")

    if sec4:
        lines.append(sec4)
        lines.append("")
    lines.append("[#OTP_Cell]")
    for idx, reg in enumerate(registers):
        addr = reg['address']
        lines.append(f"{idx}:\tOTP_{addr:<10}\t={addr}")
    lines.append("")

    return "\n".join(lines)


def build_treg_file(excel_file: Optional[str], dst_treg_path: str, template_path: Optional[str] = None) -> bool:
    """Build dynamic .treg file from Excel Trim_reg sheet, with fallback to template.treg."""
    if template_path is None:
        template_path = os.path.join(TEMPLATE_DIR, "template.treg")

    if excel_file and os.path.exists(excel_file) and excel_file.lower().endswith(('.xlsx', '.xlsm')):
        try:
            wb = openpyxl.load_workbook(excel_file, data_only=True)
            target_sheet = None
            for name in wb.sheetnames:
                if 'trim' in name.lower():
                    target_sheet = name
                    break

            if target_sheet:
                ws = wb[target_sheet]
                registers, trim_params, param_order = parse_trim_reg_sheet(ws)
                if registers:
                    content = generate_treg_content(registers, trim_params, param_order, template_path)
                    with open(dst_treg_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"  [+] Generated dynamic trim configuration ({len(registers)} registers, {len(trim_params)} parameters): {os.path.basename(dst_treg_path)}")
                    return True
        except Exception as e:
            print(f"  [!] Warning: Failed to parse Trim_reg sheet: {e}")

    # Fallback to copying template.treg
    if os.path.exists(template_path):
        with open(template_path, 'r', encoding='utf-8', errors='ignore') as f:
            tpl_content = f.read()
        with open(dst_treg_path, 'w', encoding='utf-8') as f:
            f.write(tpl_content)
        print(f"  [+] Fallback: Created trim configuration from template: {os.path.basename(dst_treg_path)}")
        return True
    return False


# ============================================================================
# TREG Trimming Framework Migration and Code Injection
# ============================================================================
def migrate_trim_framework_into_project(target_dir: str, pins: List, groups: List, site_count: int = 8, cbits_macros: Optional[List[str]] = None, excel_file: Optional[str] = None):
    source_dir = os.path.join(target_dir, 'source')
    proj_name = get_project_name(target_dir)

    print(f"\n[*] Integrating TREG framework into project: {proj_name} (Sites: {site_count})")

# 1. Generate Pin_Channel_define.h
    pin_h_path = os.path.join(source_dir, 'Pin_Channel_define.h')
    write_file(pin_h_path, gen_pin_channel_define(pins, groups, site_count), 'utf-8')
    print(f"  [+] Generated pin channel define: {pin_h_path}")

# 2. Copy framework template files
    for cf in FRAMEWORK_FILES:
        src = os.path.join(TEMPLATE_DIR, cf)
        dst = os.path.join(source_dir, cf)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"  [+] Copied framework file: {cf}")
        else:
            print(f"  [!] Missing template file: {src}")

# 3. Generate <ProjectName>.treg config file
    dst_treg = os.path.join(target_dir, f"{proj_name}.treg")
    src_treg = os.path.join(TEMPLATE_DIR, 'template.treg')
    build_treg_file(excel_file, dst_treg, template_path=src_treg)

    # Process
    test_cpp_path = os.path.join(source_dir, 'test.cpp')
    if os.path.exists(test_cpp_path):
        content, enc, crlf = read_file(test_cpp_path)
        pp_block = gen_pinplanner_block(pins, groups, site_count)

        b = content.find('/****STS_PINPLANNER_CODE_BEGIN****/')
        e = content.find('/****STS_PINPLANNER_CODE_END****/')
        if b != -1 and e != -1:
            e_end = content.find('\n', e)
            content = content[:b] + pp_block + content[e_end + 1:]
        else:
            incs = '#include "stdafx.h"\n#include "math.h"\n#include "test_method.h"\n#include "Pin_Channel_define.h"\n#include <time.h>\n#include <stdio.h>\n\n'
            # Process
            for m in list(re.finditer(r'DUT_API\s+void\s+HardWareCfg\s*\([^)]*\)', content)):
                ob = content.find('{', m.end())
                cb = find_matching_brace(content, ob)
                if ob != -1 and cb != -1:
                    content = content[:m.start()] + content[cb + 1:]
            content = incs + pp_block + '\n' + content

        if 'TREG dut;' not in content:
            globals_code = (
                f'\n// ============================================================\n'
                f'// TREG trim framework globals\n'
                f'// ============================================================\n'
                f'TREG dut;                              // TREG trim global instance\n'
                f'Test_Method test_method;\n'
                f'int globalsite = 0;\n'
                f'BYTE sitesta[Num_Site];\n'
                f'bool QC = false;\n'
                f'bool DO_TRIM = true;\n'
                f'int trimm_enable = 0;\n'
                f'int I2C_DEVICE_ADDR = 0x48;\n'
                f'double sts_result[SITE_NUM] = {{ 0 }};\n'
                f'double sts_result1[SITE_NUM] = {{ 0 }};\n'
                f'double sts_result2[SITE_NUM] = {{ 0 }};\n'
                f'double sts_result3[SITE_NUM] = {{ 0 }};\n'
                f'ULONG ulWriteData[SITE_NUM];\n'
            )
            m_end = content.find('/****STS_PINPLANNER_CODE_END****/')
            if m_end != -1:
                nl = content.find('\n', m_end)
                content = content[:nl + 1] + globals_code + content[nl + 1:]
            else:
                content = globals_code + content
        else:
            if 'Test_Method test_method;' not in content:
                m = re.search(r'(TREG\s+dut\s*;[^\r\n]*)', content)
                if m:
                    content = content[:m.end()] + crlf + 'Test_Method test_method;' + content[m.end():]

        m_ul_t = re.search(r'DUT_API\s+void\s+UserLoad\s*\(', content)
        if m_ul_t:
            if 'STSMaskTHBConfigCheck' not in content:
                decl = 'extern "C" int USERRES_API STSMaskTHBConfigCheck(bool maskFlag);/////clear EEPROM\n'
                content = content[:m_ul_t.start()] + decl + crlf + content[m_ul_t.start():]
                m_ul_t = re.search(r'DUT_API\s+void\s+UserLoad\s*\(', content)
            ob = content.find('{', m_ul_t.end())
            cb = find_matching_brace(content, ob)
            if ob != -1 and cb != -1:
                ul_body = content[ob + 1:cb]
                if 'STSMaskTHBConfigCheck(' not in ul_body:
                    content = content[:ob + 1] + crlf + '\tSTSMaskTHBConfigCheck(true);//clear EEPROM' + crlf + content[ob + 1:]

        def patch_body(name, marker, insert):
            nonlocal content
            m = re.search(r'DUT_API\s+void\s+' + name + r'\s*\(', content)
            if not m:
                return
            ob = content.find('{', m.end())
            cb = find_matching_brace(content, ob)
            body = content[ob + 1:cb]
            if marker not in body:
                content = content[:ob + 1] + crlf + insert + content[ob + 1:]

        patch_body('InitBeforeTestFlow', 'dut.sot();', '\tStsGetSiteStatus(sitesta, Num_Site);\r\n\tdut.sot();')
        patch_body('InitAfterTestFlow', 'dut.eot();', '\tdut.eot();')

        if 'TEST_TRIM_VBG' not in content:
            content = content.rstrip() + crlf + crlf + TRIM_VBG_FUNC + crlf

        write_file(test_cpp_path, content, enc)
        print(f"  [+] Successfully updated test.cpp (PinPlanner + TREG + TEST_TRIM_VBG)")

    # Process
    stdafx_h_path = os.path.join(source_dir, 'StdAfx.h')
    if os.path.exists(stdafx_h_path):
        content, enc, crlf = read_file(stdafx_h_path)
        if '#include <iostream>' not in content:
            content = content.replace('#include <string>', '#include <string>\r\n#include <iostream>\r\n#include <fstream>')

        if 'extern TREG dut;' not in content:
            block = (
                f'\n// ============================================================\n'
                f'// Multi-site / trim framework definitions\n'
                f'// ============================================================\n'
                f'#define Num_Site {site_count}\n'
                f'#define STS_SITE_NUM {site_count}\n'
                f'#define SITE_NUM STS_SITE_NUM\n\n'
                f'#define I2C_ADDR_DEVICE 0x48\n\n'
                f'const float I2C_VIH_VOLTAGE = (float)(1.8);\n'
                f'const float I2C_VIL_VOLTAGE = (float)(0.1);\n'
                f'const float I2C_VOH_VOLTAGE = (float)(0.8);\n'
                f'const float I2C_VOL_VOLTAGE = (float)(0.6);\n'
                f'const float I2C_PERIOD = (float)(20 * 1e3f);\n\n'
                f'#include "treg.h"\n\n'
                f'extern TREG dut;\n'
                f'extern int globalsite;\n'
                f'extern BYTE sitesta[Num_Site];\n'
                f'extern double sts_result[SITE_NUM];\n'
                f'extern bool QC;\n'
                f'extern bool DO_TRIM;\n'
                f'extern int trimm_enable;\n'
                f'extern ULONG ulWriteData[SITE_NUM];\n'
                f'extern DCM dcm;\n'
                f'extern CBITe cbit;\n'
                f'extern int I2C_DEVICE_ADDR;\n\n'
                f'#define SITE globalsite\n'
                f'#define SERIAL for(globalsite=0;globalsite<Num_Site;globalsite++)  if(sitesta[globalsite])\n'
                f'#define SERIAL_ALL for(globalsite=0;globalsite<Num_Site;globalsite++)\n'
            )
            if '#include "userres.h"' in content:
                idx = content.find('#include "userres.h"') + len('#include "userres.h"')
                content = content[:idx] + block + content[idx:]
            elif '#endif' in content:
                idx = content.rfind('#endif')
                content = content[:idx] + block + crlf + content[idx:]
            else:
                content = content + block

        # CBITe relay channel macros
        k_lines = cbits_macros if (cbits_macros and len(cbits_macros) > 0) else K_MACRO_LINES
        kblock = '\n// CBITe relay channel macros\n' + '\n'.join(k_lines) + '\n'

        if '// CBITe relay channel macros' not in content and 'K_ALL_CAP' not in content:
            if '#endif' in content:
                idx = content.rfind('#endif')
                content = content[:idx] + kblock + crlf + content[idx:]
            else:
                content = content + kblock
        else:
            m_cb = re.search(r'//\s*CBITe\s+relay\s+channel\s+macros[\s\S]*?(?=\r?\n\s*(?://\s*I2C|//\s*Unit|extern\s+|typedef\s+|class\s+|#endif|$))', content)
            if m_cb:
                content = content[:m_cb.start()] + kblock.lstrip('\r\n') + content[m_cb.end():]
            elif 'K_ALL_CAP' in content:
                m_cap = re.search(r'(#define\s+K[0-9_][\s\S]*?#define\s+K_ALL_CAP[^\r\n]*)', content)
                if m_cap:
                    content = content[:m_cap.start()] + kblock.lstrip('\r\n') + content[m_cap.end():]

        if 'OTP_Preview_Byte' not in content:
            protos = (
                '\n// I2C / trim helper functions (implemented in StdAfx.cpp)\n'
                'extern void OTP_Preview_Byte(BYTE SlaveAddress, int RegAddress, const char* reg_str);\n'
                'extern void I2CWriteSameData(BYTE SlaveAddress, DWORD RegAddress, DWORD data);\n'
                'extern void I2Cread(int I2CREG, double *readvale);\n'
                'extern void DIO_I2C_Init(float Period, float VIH, float VIL, float VOH, float VOL);\n\n'
                'extern "C" int GetPgsFullPath(LPTSTR pgsPath, int chNum);\n'
            )
            if '#endif' in content:
                idx = content.rfind('#endif')
                content = content[:idx] + protos + crlf + content[idx:]
            else:
                content = content + protos

        if '#define mA *1e3' not in content:
            ublock = '\n// Unit conversion macros\n' + '\n'.join(UNIT_MACROS) + '\n'
            if '#endif' in content:
                idx = content.rfind('#endif')
                content = content[:idx] + ublock + crlf + content[idx:]
            else:
                content = content + ublock

        write_file(stdafx_h_path, content, enc)
        print(f"  [+] Successfully updated StdAfx.h (TREG / relays / I2C / unit macros)")

    # Process
    stdafx_cpp_path = os.path.join(source_dir, 'StdAfx.cpp')
    if os.path.exists(stdafx_cpp_path):
        content, enc, crlf = read_file(stdafx_cpp_path)
        if 'CBITe cbit;' not in content:
            content = content + '\n// Global instrument objects\nCBITe cbit;\nDCM dcm;\n'
        for fn in HELPER_FUNC_NAMES:
            if ('void ' + fn) not in content:
                content = content + '\n' + HELPER_FUNCS[fn] + '\n'
        write_file(stdafx_cpp_path, content, enc)
        print(f"  [+] Successfully updated StdAfx.cpp (CBITe / DCM / I2C helpers)")

    # Process
    main_cpp_name = f"{proj_name}.cpp"
    main_cpp_path = os.path.join(source_dir, main_cpp_name)
    if os.path.exists(main_cpp_path):
        content, enc, crlf = read_file(main_cpp_path)
        if 'STSMaskTHBConfigCheck' not in content:
            m = re.search(r'DUT_API\s+void\s+UserLoad\s*\(', content)
            if m:
                decl = 'extern "C" int USERRES_API STSMaskTHBConfigCheck(bool maskFlag);/////clear EEPROM\n'
                content = content[:m.start()] + decl + crlf + content[m.start():]

        m_ul = re.search(r'DUT_API\s+void\s+UserLoad\s*\([^)]*\)', content)
        if m_ul:
            ob = content.find('{', m_ul.end())
            cb = find_matching_brace(content, ob)
            if ob != -1 and cb != -1:
                ul_body = content[ob + 1:cb]
                if 'STSMaskTHBConfigCheck(' not in ul_body:
                    content = content[:ob + 1] + crlf + '\tSTSMaskTHBConfigCheck(true);//clear EEPROM' + crlf + content[ob + 1:]

        if 'dut.init(' not in content:
            m = re.search(r'DUT_API\s+void\s+UserInit\s*\(', content)
            if m:
                ob = content.find('{', m.end())
                init_code = (
                    '\t// Initialize TREG trim framework configuration\n'
                    '\tchar pgsfullpath[300] = { 0 };\n'
                    '\tGetPgsFullPath(pgsfullpath, 300);\n'
                    '\tstring fullpathpgs(pgsfullpath);\n'
                    '\tstring pathofpgs = "";\n\n'
                    '\tint pos = fullpathpgs.find_last_of(\'\\\\\');\n'
                    '\tif (pos > -1)\n'
                    '\t{\n'
                    '\t\tpathofpgs = pathofpgs.substr(0, pos + 1);\n'
                    '\t}\n'
                    f'\tstring pathoftreg = pathofpgs + "{proj_name}.treg";\n'
                    '\tdut.init(pathoftreg.c_str(), SITE_NUM, QC, DO_TRIM);\n'
                )
                content = content[:ob + 1] + crlf + init_code + content[ob + 1:]

        write_file(main_cpp_path, content, enc)
        print(f"  [+] Successfully updated main source file: {main_cpp_name} (mounted dut.init)")

    # Process
    for fname in os.listdir(source_dir):
        if fname.lower().endswith('.vcxproj') and not fname.lower().endswith(('.filters', '.user')):
            vpath = os.path.join(source_dir, fname)
            content, enc, crlf = read_file(vpath)
            if 'treg.cpp' not in content:
                if '<ClCompile Include="test.cpp"' in content:
                    content = content.replace(
                        '<ClCompile Include="test.cpp" />',
                        '<ClCompile Include="inireader.cpp" />\n    <ClCompile Include="test.cpp" />\n    <ClCompile Include="treg.cpp" />')
                if '<ClInclude Include="StdAfx.h"' in content:
                    content = content.replace(
                        '<ClInclude Include="StdAfx.h" />',
                        '<ClInclude Include="inireader.h" />\n    <ClInclude Include="Pin_Channel_define.h" />\n    <ClInclude Include="StdAfx.h" />\n    <ClInclude Include="test_method.h" />\n    <ClInclude Include="treg.h" />')
                write_file(vpath, content, enc)
                print(f"  [+] Updated project file: {fname} (added compilation items)")

    # Process
    inject_function_timing(source_dir)

# 10. Generate build_verify.cmd
    gen_build_verify_cmd(target_dir, proj_name)


# ============================================================================
# Process
# ============================================================================
def inject_function_timing(source_dir: str):
    print("  [*] Injecting test function execution timing (TTR / time.csv)...")
    
    # 1. StdAfx.cpp
    path_cpp = os.path.join(source_dir, 'StdAfx.cpp')
    if os.path.exists(path_cpp):
        content, enc, crlf = read_file(path_cpp)
        if 'void clearTimeCsv()' not in content:
            func_code = f"""{crlf}{crlf}void clearTimeCsv() {{{crlf}\tstd::ofstream file("time.csv", std::ios::out | std::ios::trunc);{crlf}\tif (file.is_open()) {{{crlf}\t\tfile << "test_name,time\\n";{crlf}\t\tfile.close();{crlf}\t\tstd::cout << "time.csv reset" << std::endl;{crlf}\t}}{crlf}\telse {{{crlf}\t\tstd::cerr << "Unable to clear time.csv" << std::endl;{crlf}\t}}{crlf}}}{crlf}{crlf}void writeToTimeCsv(const std::string& testName, double start_time) {{{crlf}\tdouble end_time = STSGetTimeElapsed(0);{crlf}{crlf}\tstd::ifstream checkFile("time.csv");{crlf}\tbool isFirstCall = !checkFile.good();{crlf}\tcheckFile.close();{crlf}{crlf}\tstd::ofstream file;{crlf}\tif (isFirstCall) {{{crlf}\t\tfile.open("time.csv", std::ios::out | std::ios::trunc);{crlf}\t\tif (file.is_open()) {{{crlf}\t\t\tfile << "test_name, time\\n";{crlf}\t\t}}{crlf}\t}}{crlf}\telse {{{crlf}\t\tfile.open("time.csv", std::ios::out | std::ios::app);{crlf}\t}}{crlf}{crlf}\tif (file.is_open()) {{{crlf}\t\tfile << testName << "," << (end_time - start_time) << std::endl;{crlf}\t\tfile.close();{crlf}\t}}{crlf}\telse {{{crlf}\t\tstd::cerr << "Unable to open time.csv" << std::endl;{crlf}\t}}{crlf}}}{crlf}"""
            content = content.rstrip() + func_code
            write_file(path_cpp, content, enc)

    # 2. StdAfx.h
    path_h = os.path.join(source_dir, 'StdAfx.h')
    if os.path.exists(path_h):
        content, enc, crlf = read_file(path_h)
        if 'writeToTimeCsv' not in content:
            decls = f"{crlf}{crlf}extern void writeToTimeCsv(const std::string& testName, double start_time);{crlf}extern void clearTimeCsv();{crlf}"
            content = content.rstrip() + decls
            write_file(path_h, content, enc)

    # 3. test.cpp
    path_test = os.path.join(source_dir, 'test.cpp')
    if os.path.exists(path_test):
        content, enc, crlf = read_file(path_test)
        if not re.search(r'\bint\s+TTR\s*=', content):
            m = re.search(r'ULONG ulWriteData\[SITE_NUM\];', content)
            if m:
                content = content[:m.end()] + f"{crlf}int TTR = 1;{crlf}double start_time = 0;{crlf}" + content[m.end():]

        # InitBeforeTestFlow clearTimeCsv
        init_m = re.search(r'DUT_API\s+void\s+InitBeforeTestFlow\s*\(\s*\)', content)
        if init_m:
            ob = content.find('{', init_m.end())
            cb = find_matching_brace(content, ob)
            if ob != -1 and cb != -1 and 'clearTimeCsv()' not in content[ob:cb]:
                last_nl = content.rfind('\n', ob, cb)
                if last_nl != -1:
                    content = content[:last_nl] + f"{crlf}\tif (TTR) clearTimeCsv();{crlf}" + content[last_nl:]

        # Process all test functions
        func_re = re.compile(r'^[ \t]*DUT_API\s+int\s+(\w+)\s*\([^)]*funcindex[^)]*\)', re.MULTILINE)
        matches = list(func_re.finditer(content))
        for m in reversed(matches):
            fn_name = m.group(1)
            ob = content.find('{', m.end())
            cb = find_matching_brace(content, ob)
            if ob == -1 or cb == -1:
                continue
            body = content[ob:cb + 1]
            if f'writeToTimeCsv("{fn_name}"' in body:
                continue

            # Insert start_time statement
            cp_matches = list(re.finditer(r'^[ \t]*CParam\s*\*\s*\w+\s*=\s*StsGetParam\s*\([^;]+;[^\n]*', body, re.MULTILINE))
            if cp_matches:
                last_cp_end = cp_matches[-1].end()
                nl_pos = body.find('\n', last_cp_end)
                ins_pos = (nl_pos + 1) if nl_pos != -1 else last_cp_end
                proto_close = re.search(r'^[ \t]*//\s*\}\}\s*AFX_STS_PARAM_PROTOTYPES[^\n]*\n', body[ins_pos:ins_pos + 300], re.MULTILINE)
                if proto_close:
                    ins_pos += proto_close.end()
            else:
                ins_pos = body.find('{') + 1

            start_stmt = f"\tif (TTR) start_time = STSSetTimeCheck(0);{crlf}{crlf}"
            with_start = body[:ins_pos] + start_stmt + body[ins_pos:].lstrip('\r\n')

            ret_matches = list(re.finditer(r'^[ \t]*return\s+0\s*;', with_start, re.MULTILINE))
            if ret_matches:
                ret_start = ret_matches[-1].start()
                write_stmt = f"\tif (TTR)  writeToTimeCsv(\"{fn_name}\", start_time);{crlf}{crlf}"
                new_body = with_start[:ret_start] + write_stmt + with_start[ret_start:]
            else:
                write_stmt = f"{crlf}\tif (TTR)  writeToTimeCsv(\"{fn_name}\", start_time);{crlf}"
                new_body = with_start[:-1] + write_stmt + "}"

            content = content[:ob] + new_body + content[cb + 1:]

        write_file(path_test, content, enc)
        print("  [+] Successfully injected test function timing (TTR = 1)")


def gen_build_verify_cmd(target_dir: str, proj_name: str):
    dst = os.path.join(target_dir, 'build_verify.cmd')
    tpl = r'''@echo off
rem build_verify.cmd - Build & verify {PROJ}.dll (VS2013 / cl.exe)
call "C:\Program Files (x86)\Microsoft Visual Studio 12.0\VC\bin\vcvars32.bat" >nul 2>&1
cd /d "%~dp0source"
if exist Release rmdir /s /q Release
mkdir Release
cl /nologo /c /EHsc /DWIN32 /DNDEBUG /D_WINDOWS /D_USRDLL /D{PROJ_U}_EXPORTS /I"C:\AccoTEST\AccoTEST System\INCLude" /Fo"Release\\" {MAIN}.cpp StdAfx.cpp test.cpp inireader.cpp treg.cpp > "%TEMP%\hermes-verify-compile.log" 2>&1
if errorlevel 1 goto FAIL
link /nologo /DLL /OUT:..\{PROJ}.dll Release\*.obj odbc32.lib odbccp32.lib UserRes.lib UserType.lib /LIBPATH:"C:\AccoTEST\AccoTEST System\lIB" /LIBPATH:"C:\AccoTEST\AccoTEST System\INCLude" > "%TEMP%\hermes-verify-link.log" 2>&1
if errorlevel 1 goto FAIL
dumpbin /exports ..\{PROJ}.dll > "%TEMP%\hermes-verify-exports.txt" 2>&1
findstr /c:"TEST_TRIM_VBG" "%TEMP%\hermes-verify-exports.txt" >nul 2>&1
if errorlevel 1 goto NOEXPORT
echo HERMES_VERIFY_RESULT=PASS
goto END
:NOEXPORT
echo HERMES_VERIFY_RESULT=FAIL_NO_EXPORT
goto END
:FAIL
echo HERMES_VERIFY_RESULT=FAIL
:END
echo.
pause
'''
    script = tpl.replace('{PROJ}', proj_name).replace('{PROJ_U}', proj_name.upper()).replace('{MAIN}', proj_name)
    write_file(dst, script, 'ascii')
    print(f"  [+] Generated build verification script: {dst}")


# ============================================================================
# Main entry: Build complete test project from Excel specification
# ============================================================================
def build_program_from_excel(excel_file: str, output_dir: Optional[str] = None, site_count_override: Optional[int] = None) -> str:
    print("=" * 72)
    print(f"  AccoTEST Automated Test Project Build & TREG Framework Integration")
    print("=" * 72)
    print(f"[*] Reading Excel: {excel_file}")

    all_params, functions, pins, groups, detected_sites, cbits_macros = parse_excel(excel_file)
    site_count = site_count_override if site_count_override is not None else detected_sites

    base_name = os.path.splitext(os.path.basename(excel_file))[0]
    project_name = base_name

    if output_dir is None:
        excel_dir = os.path.dirname(os.path.abspath(excel_file))
        project_dir = os.path.join(excel_dir, project_name)
    else:
        project_dir = os.path.abspath(output_dir)

    source_dir = os.path.join(project_dir, 'source')
    os.makedirs(source_dir, exist_ok=True)

    print(f"[*] Parsed test parameters: {len(all_params)} items, across {len(functions)} test functions")
    print(f"[*] Parsed hardware pins: {len(pins)} pins, groups: {len(groups)} groups, site count: {site_count} Site(s)")

# 1. Generate <ProjectName>.PGS
    pgs_path = os.path.join(project_dir, f"{project_name}.PGS")
    pgs_bytes = generate_pgs_content(project_name, all_params, site_count=site_count)
    with open(pgs_path, 'wb') as f:
        f.write(pgs_bytes)
    print(f"[+] Generated PGS configuration (sSiteCount = {site_count}): {pgs_path}")

    # 2. Generate initial source and project files
    guid_str = f"{{{str(uuid.uuid4()).upper()}}}"
    write_file(os.path.join(source_dir, f"{project_name}.cpp"), generate_main_cpp(project_name), 'gbk')
    write_file(os.path.join(source_dir, "test.cpp"), generate_initial_test_cpp(functions), 'gbk')
    write_file(os.path.join(source_dir, "StdAfx.h"), generate_stdafx_h(), 'gbk')
    write_file(os.path.join(source_dir, "StdAfx.cpp"), generate_stdafx_cpp(), 'gbk')
    write_file(os.path.join(source_dir, f"{project_name}.sln"), generate_sln(project_name, guid_str), 'utf-8-sig')
    write_file(os.path.join(source_dir, f"{project_name}.vcxproj"), generate_vcxproj(project_name, guid_str), 'utf-8')
    write_file(os.path.join(source_dir, f"{project_name}.vcxproj.filters"), generate_vcxproj_filters(project_name), 'utf-8')
    write_file(os.path.join(source_dir, f"{project_name}.vcproj"), generate_vcproj(project_name, guid_str), 'gb2312')
    write_file(os.path.join(source_dir, f"{project_name}.dsp"), generate_dsp(project_name), 'gbk')
    write_file(os.path.join(source_dir, f"{project_name}.dsw"), generate_dsw(project_name), 'gbk')

    # 3. Inject TREG framework, PinPlanner and function timing
    migrate_trim_framework_into_project(project_dir, pins, groups, site_count=site_count, cbits_macros=cbits_macros, excel_file=excel_file)

    print("\n" + "=" * 72)
    print(f" [SUCCESS] AccoTEST test project successfully built: {project_dir}")
    print(f" [*] Build verification: Run build_verify.cmd in project directory to verify DLL compilation")
    print("=" * 72)
    return project_dir


# ============================================================================
# CLI and interactive selection
# ============================================================================
def find_local_excel_files() -> List[str]:
    files = []
    for f in os.listdir(SCRIPT_DIR):
        if f.lower().endswith(('.xlsx', '.xls')) and not f.startswith('~$') and f.lower() != 'pin_define.xlsx':
            files.append(os.path.join(SCRIPT_DIR, f))
    return sorted(files)


def find_local_project_dirs() -> List[str]:
    dirs = []
    skip = {'template', '__pycache__', '.git', '.agent'}
    for d in os.listdir(SCRIPT_DIR):
        full = os.path.join(SCRIPT_DIR, d)
        if os.path.isdir(full) and d.lower() not in skip and not d.startswith('.'):
            if os.path.isdir(os.path.join(full, 'source')):
                dirs.append(full)
    return sorted(dirs)


def main():
    parser = argparse.ArgumentParser(description="AccoTEST Excel to Empty Program and TREG Framework Tool")
    parser.add_argument("target_pos", nargs="?", help="Target Excel file (.xlsx/.xls) or project directory (optional)", default=None)
    parser.add_argument("-t", "--target", dest="target_opt", help="Target Excel file (.xlsx/.xls) or project directory (optional)", default=None)
    parser.add_argument("-s", "--site", type=int, default=None, help="Site count (defaults to reading from Excel, or 8)")
    parser.add_argument("-o", "--output", help="Custom output directory (optional)", default=None)
    args = parser.parse_args()

    target = args.target_opt or args.target_pos

# If arguments not specified, auto detect local Excel files
    if not target:
        excel_files = find_local_excel_files()
        project_dirs = find_local_project_dirs()

        if len(excel_files) == 1:
# Single Excel file detected, run automatically without prompt
            target = excel_files[0]
            print(f"[*] Auto detected and selected Excel file: {os.path.basename(target)}")
        elif len(excel_files) > 1:
            print("=" * 60)
            print("  Multiple Excel files detected, please choose target:")
            print("=" * 60)
            for i, c in enumerate(excel_files, 1):
                print(f"  [{i}] {os.path.basename(c)}")
            print(f"  [{len(excel_files) + 1}] Enter path manually")
            choice = input(f"Enter choice (default [1] {os.path.basename(excel_files[0])}): ").strip()
            if not choice or choice == "1":
                target = excel_files[0]
            elif choice.isdigit() and 1 <= int(choice) <= len(excel_files):
                target = excel_files[int(choice) - 1]
            else:
                target = input("Enter full path: ").strip()
        elif len(project_dirs) == 1:
            target = project_dirs[0]
            print(f"[*] Auto detected and selected AccoTEST project: {os.path.basename(target)}")
        elif len(project_dirs) > 1:
            print("=" * 60)
            print("  Multiple AccoTEST projects detected, please choose target:")
            print("=" * 60)
            for i, c in enumerate(project_dirs, 1):
                print(f"  [{i}] {os.path.basename(c)}")
            choice = input(f"Enter choice (default [1] {os.path.basename(project_dirs[0])}): ").strip()
            if not choice or choice == "1":
                target = project_dirs[0]
            elif choice.isdigit() and 1 <= int(choice) <= len(project_dirs):
                target = project_dirs[int(choice) - 1]
            else:
                target = input("Enter full path: ").strip()
        else:
            target = input("Enter Excel file path (.xlsx/.xls): ").strip()

    if not target or not os.path.exists(target):
        print(f"\n[ERROR] Target does not exist or was not specified: {target}")
        sys.exit(1)

    try:
        target_path = os.path.abspath(target)
        if os.path.isfile(target_path) and target_path.lower().endswith(('.xls', '.xlsx')):
            build_program_from_excel(target_path, output_dir=args.output, site_count_override=args.site)
        elif os.path.isdir(target_path) and os.path.isdir(os.path.join(target_path, 'source')):
            print(f"[*] Performing trim framework migration on existing project: {target_path}")
            pins = DEFAULT_PINS
            groups = DEFAULT_GROUPS
            site_count = args.site if args.site is not None else DEFAULT_SITE_CNT
            migrate_trim_framework_into_project(target_path, pins, groups, site_count=site_count)
            print(f"\n[SUCCESS] Migration completed: {target_path}")
        else:
            print(f"\n[ERROR] Invalid target, must be an Excel file (.xlsx/.xls) or project directory containing source/: {target_path}")
            sys.exit(1)
    except Exception as e:
        print("\n" + "!" * 60)
        print(f"[EXCEPTION] Exception occurred during execution:")
        import traceback
        traceback.print_exc()
        print("!" * 60)
        sys.exit(1)


if __name__ == '__main__':
    main()


# Backward compatibility alias
generate_empty_program = build_program_from_excel
